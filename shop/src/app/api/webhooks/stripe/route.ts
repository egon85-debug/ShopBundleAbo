import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db";
import { orders, payments, webhookEvents } from "@/db/schema";
import { constructWebhookEvent } from "@/lib/stripe";
import { markOrderPaid, markOrderPaymentFailed, recordRefund } from "@/services/orders";

export const runtime = "nodejs";
// Der Rohbody wird für die Signaturprüfung benötigt – kein Body-Parsing.
export const dynamic = "force-dynamic";

/**
 * Stripe-Webhook: einziger Weg, auf dem eine Bestellung „bezahlt“ wird.
 *
 * - Signatur wird immer geprüft (STRIPE_WEBHOOK_SECRET).
 * - Jedes Event wird über `webhook_events` genau einmal verarbeitet (Idempotenz).
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signatur fehlt" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (error) {
    console.error("[Stripe-Webhook] Signaturprüfung fehlgeschlagen:", error);
    return NextResponse.json({ error: "Signatur ungültig" }, { status: 400 });
  }

  // Idempotenz: bereits gesehene Events werden bestätigt, aber nicht erneut ausgeführt.
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: "stripe", eventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        if (orderId && paymentIntentId) {
          await db
            .update(payments)
            .set({ providerPaymentId: paymentIntentId })
            .where(eq(payments.providerSessionId, session.id));

          if (session.payment_status === "paid") {
            await markOrderPaid(orderId, paymentIntentId, session.payment_method_types?.[0]);
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.orderId;
        if (orderId) {
          await markOrderPaid(orderId, intent.id, intent.payment_method_types?.[0]);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.orderId;
        if (orderId) {
          await markOrderPaymentFailed(orderId, intent.last_payment_error?.message ?? "Zahlung fehlgeschlagen");
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const orderId = charge.metadata?.orderId;
        const refund = charge.refunds?.data?.[0];
        if (orderId && refund) {
          const [payment] = await db
            .select()
            .from(payments)
            .where(eq(payments.providerPaymentId, String(charge.payment_intent)))
            .limit(1);
          await recordRefund({
            orderId,
            paymentId: payment?.id ?? null,
            providerRefundId: refund.id,
            amountCents: refund.amount,
            reason: refund.reason ?? "Erstattung über Stripe",
          });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        if (orderId) {
          await markOrderPaymentFailed(orderId, "Checkout-Sitzung abgelaufen");
          await db.update(orders).set({ paymentStatus: "cancelled" }).where(eq(orders.id, orderId));
        }
        break;
      }

      default:
        // Nicht behandelte Ereignistypen werden bewusst nur protokolliert.
        break;
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.eventId, event.id));

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Stripe-Webhook] Verarbeitung von ${event.type} fehlgeschlagen:`, error);
    // 500 → Stripe wiederholt die Zustellung automatisch.
    return NextResponse.json({ error: "Verarbeitung fehlgeschlagen" }, { status: 500 });
  }
}
