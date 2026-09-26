import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customers, payments } from "@/db/schema";
import { hashPassword, createSession, getCurrentCustomer } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validation";
import { getOrCreateCart, summarize } from "@/services/cart";
import { createOrderFromCart, sendOrderConfirmation } from "@/services/orders";

export const runtime = "nodejs";

/**
 * Bestellung anlegen und Stripe-Checkout starten.
 *
 * Sicherheit: Sämtliche Beträge werden serverseitig aus dem Warenkorb berechnet –
 * der Client kann keine Preise beeinflussen. Die Bestellung gilt erst nach dem
 * verifizierten Webhook als bezahlt (siehe /api/webhooks/stripe).
 */
export async function POST(request: Request) {
  const ip = clientIp(await headers());
  if (!rateLimit(`checkout:${ip}`, 12)) {
    return NextResponse.json({ error: "Zu viele Bestellversuche. Bitte kurz warten." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const cartId = await getOrCreateCart();
  const cart = await summarize(cartId);
  if (cart.lines.length === 0) {
    return NextResponse.json({ error: "Ihr Warenkorb ist leer." }, { status: 400 });
  }

  // Optionales Kundenkonto anlegen (Gastbestellung bleibt möglich).
  let customer = await getCurrentCustomer();
  if (!customer && input.createAccount && input.password) {
    const email = input.email.toLowerCase();
    const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "Für diese E-Mail existiert bereits ein Konto. Bitte melden Sie sich an." },
        { status: 409 },
      );
    }
    const [created] = await db
      .insert(customers)
      .values({
        email,
        passwordHash: await hashPassword(input.password),
        firstName: input.shippingAddress.firstName,
        lastName: input.shippingAddress.lastName,
        phone: input.phone ?? null,
      })
      .returning();
    customer = created;
    await createSession("customer", created.id);
  }

  let order;
  try {
    order = await createOrderFromCart({
      cartId,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingSameAsShipping
        ? input.shippingAddress
        : (input.billingAddress ?? input.shippingAddress),
      shippingMethod: input.shippingMethod,
      customerId: customer?.id ?? null,
      customerNote: input.customerNote ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bestellung konnte nicht angelegt werden." },
      { status: 400 },
    );
  }

  await sendOrderConfirmation(order.id);

  // Ohne Stripe-Konfiguration bleibt die Bestellung als "Zahlung ausstehend" bestehen.
  if (!stripeConfigured()) {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      warning:
        "Stripe ist nicht konfiguriert – die Bestellung wurde mit Status „Zahlung ausstehend“ gespeichert.",
    });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Zahlungsarten (Karte, Apple Pay, Google Pay, …) steuert das Stripe-Konto
    // über "automatic_payment_methods" bzw. die Dashboard-Einstellungen.
    line_items: [
      ...cart.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: "eur",
          unit_amount: line.unitPriceCents,
          product_data: {
            name: line.variantName ? `${line.name} – ${line.variantName}` : line.name,
            metadata: { sku: line.sku },
          },
        },
      })),
      // Pfand als eigene Position – er steckt nicht im Warenpreis.
      ...(order.depositCents > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency: "eur",
                unit_amount: order.depositCents,
                product_data: { name: "Pfand" },
              },
            },
          ]
        : []),
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: order.shippingCents,
          product_data: { name: `Versand: ${input.shippingMethod === "dhl_express" ? "DHL Express" : "DHL Paket"}` },
        },
      },
    ],
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
    payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.orderNumber } },
    success_url: `${siteUrl()}/bestellung/${order.orderNumber}?bezahlt=1`,
    cancel_url: `${siteUrl()}/warenkorb?abgebrochen=1`,
  });

  await db.insert(payments).values({
    orderId: order.id,
    provider: "stripe",
    providerSessionId: session.id,
    providerPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    status: "pending",
    amountCents: order.totalCents,
    currency: order.currency,
  });

  return NextResponse.json({ url: session.url, orderNumber: order.orderNumber });
}
