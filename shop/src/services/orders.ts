import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  AddressSnapshot,
  adminNotes,
  cartItems,
  inventory,
  orderItems,
  orders,
  payments,
  refunds,
  shipmentLabels,
  shipments,
  trackingEvents,
} from "@/db/schema";
import {
  cancellationMail,
  orderConfirmationMail,
  paymentConfirmationMail,
  refundMail,
  shippingConfirmationMail,
  type OrderMailData,
} from "@/lib/email/templates";
import { meldeVerkauf } from "@/lib/lager-meldung";
import { sendMail } from "@/lib/email/send";
import { siteUrl } from "@/lib/env";
import { getShippingProvider, type CarrierCode } from "@/lib/shipping/registry";
import { summarize } from "./cart";

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

/** Fortlaufende, menschenlesbare Bestellnummer: WL-2026-000123. */
async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.orderNumber} like ${`WL-${year}-%`}`);
  return `WL-${year}-${String((row?.count ?? 0) + 1).padStart(6, "0")}`;
}

export interface CreateOrderInput {
  cartId: string;
  email: string;
  phone?: string | null;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  shippingMethod: CarrierCode;
  customerId?: string | null;
  customerNote?: string | null;
}

/**
 * Bestellung aus dem Warenkorb anlegen.
 * Preise, Steuern und Versand werden IMMER serverseitig neu berechnet –
 * Beträge aus dem Client werden nie übernommen. Positionen erhalten einen
 * Snapshot der Produktdaten (Punkt 13).
 */
export async function createOrderFromCart(input: CreateOrderInput): Promise<Order> {
  const cart = await summarize(input.cartId);
  if (cart.lines.length === 0) throw new Error("Der Warenkorb ist leer.");

  for (const line of cart.lines) {
    if (!line.allowBackorder && line.quantity > line.available) {
      throw new Error(
        `„${line.name}“ ist nur noch ${line.available}× verfügbar. Bitte Menge im Warenkorb anpassen.`,
      );
    }
  }

  const provider = getShippingProvider(input.shippingMethod);
  const shippingCents = provider.priceCents;
  const orderNumber = await nextOrderNumber();

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        customerId: input.customerId ?? null,
        email: input.email,
        phone: input.phone ?? null,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        status: "new",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
        shippingMethod: input.shippingMethod,
        subtotalCents: cart.subtotalCents,
        shippingCents,
        taxCents: cart.taxCents,
        totalCents: cart.subtotalCents + shippingCents,
        customerNote: input.customerNote ?? null,
        placedAt: new Date(),
      })
      .returning();

    await tx.insert(orderItems).values(
      cart.lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        sku: line.sku,
        variantName: line.variantName,
        imageUrl: line.imageUrl,
        unitPriceCents: line.unitPriceCents,
        taxRate: line.taxRate,
        weightGrams: line.weightGrams,
        quantity: line.quantity,
        totalCents: line.lineTotalCents,
      })),
    );

    // Bestand reservieren, solange die Zahlung aussteht.
    for (const line of cart.lines) {
      await tx
        .update(inventory)
        .set({ reserved: sql`${inventory.reserved} + ${line.quantity}` })
        .where(
          and(
            eq(inventory.productId, line.productId),
            line.variantId ? eq(inventory.variantId, line.variantId) : sql`${inventory.variantId} is null`,
          ),
        );
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, input.cartId));
    return order;
  });
}

export async function getOrderById(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  return withDetails(order);
}

export async function getOrderByNumber(orderNumber: string) {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;
  return withDetails(order);
}

async function withDetails(order: Order) {
  const [items, orderPayments, orderShipments, orderRefunds, notes] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
    db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(desc(refunds.createdAt)),
    db.select().from(adminNotes).where(eq(adminNotes.orderId, order.id)).orderBy(desc(adminNotes.createdAt)),
  ]);

  const labels = orderShipments.length
    ? await db
        .select()
        .from(shipmentLabels)
        .where(inArray(shipmentLabels.shipmentId, orderShipments.map((s) => s.id)))
    : [];

  const events = orderShipments.length
    ? await db
        .select()
        .from(trackingEvents)
        .where(inArray(trackingEvents.shipmentId, orderShipments.map((s) => s.id)))
        .orderBy(desc(trackingEvents.occurredAt))
    : [];

  return { ...order, items, payments: orderPayments, shipments: orderShipments, refunds: orderRefunds, notes, labels, events };
}

/**
 * Zahlung bestätigt (wird ausschließlich vom verifizierten Stripe-Webhook aufgerufen).
 * Idempotent: ein bereits bezahlter Auftrag wird nicht erneut verbucht.
 */
export async function markOrderPaid(orderId: string, paymentIntentId: string, method?: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.paymentStatus === "paid") return;

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "paid", paymentStatus: "paid", paidAt: new Date() })
      .where(eq(orders.id, orderId));

    await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), method: method ?? null })
      .where(eq(payments.providerPaymentId, paymentIntentId));

    // Reservierung in tatsächlichen Abgang umwandeln.
    for (const item of order.items) {
      await tx
        .update(inventory)
        .set({
          quantity: sql`greatest(${inventory.quantity} - ${item.quantity}, 0)`,
          reserved: sql`greatest(${inventory.reserved} - ${item.quantity}, 0)`,
        })
        .where(
          and(
            eq(inventory.productId, item.productId!),
            item.variantId ? eq(inventory.variantId, item.variantId) : sql`${inventory.variantId} is null`,
          ),
        );
    }
  });

  // Verkauf an die Lagererfassung melden, damit dort dieselbe Bewegung entsteht.
  // Ein Fehler darf die bereits bezahlte Bestellung nicht scheitern lassen.
  await meldeVerkauf(
    order.orderNumber,
    order.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  );

  const data = mailData(order);
  const mail = paymentConfirmationMail(data);
  await sendMail({ to: order.email, subject: mail.subject, html: mail.html });
}

/** Zahlung fehlgeschlagen/abgebrochen: Reservierung freigeben. */
export async function markOrderPaymentFailed(orderId: string, reason?: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order || order.paymentStatus === "paid") return;

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ paymentStatus: "failed" }).where(eq(orders.id, orderId));
    await tx
      .update(payments)
      .set({ status: "failed", failureReason: reason ?? null })
      .where(eq(payments.orderId, orderId));
    for (const item of order.items) {
      await tx
        .update(inventory)
        .set({ reserved: sql`greatest(${inventory.reserved} - ${item.quantity}, 0)` })
        .where(
          and(
            eq(inventory.productId, item.productId!),
            item.variantId ? eq(inventory.variantId, item.variantId) : sql`${inventory.variantId} is null`,
          ),
        );
    }
  });
}

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) return;
  const mail = orderConfirmationMail(mailData(order));
  await sendMail({ to: order.email, subject: mail.subject, html: mail.html });
}

/**
 * Versandetikett über den gewählten Carrier erzeugen, Sendung + Label speichern,
 * Bestellung auf „versendet“ setzen und die Versandbestätigung verschicken.
 */
export async function createShippingLabel(orderId: string, carrier?: CarrierCode) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Bestellung nicht gefunden");
  if (order.paymentStatus !== "paid") {
    throw new Error("Versandetikett erst nach bestätigter Zahlung erstellen.");
  }

  const carrierCode = (carrier ?? order.shippingMethod) as CarrierCode;
  const provider = getShippingProvider(carrierCode);
  const weightGrams = Math.max(
    order.items.reduce((sum, item) => sum + item.weightGrams, 0),
    100,
  );

  const result = await provider.createLabel({
    orderNumber: order.orderNumber,
    recipient: { ...order.shippingAddress, email: order.email, phone: order.phone },
    parcel: { weightGrams },
    valueCents: order.totalCents,
    currency: order.currency,
    contentDescription: order.items.map((item) => item.name).slice(0, 3).join(", "),
  });

  const [shipment] = await db
    .insert(shipments)
    .values({
      orderId: order.id,
      carrier: carrierCode,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
      status: "created",
      weightGrams,
      shippedAt: new Date(),
    })
    .returning();

  await db.insert(shipmentLabels).values({
    shipmentId: shipment.id,
    format: result.labelFormat,
    labelData: result.labelBase64,
    carrierResponse: result.raw,
  });

  await db
    .update(orders)
    .set({ status: "shipped", fulfillmentStatus: "shipped", shippedAt: new Date() })
    .where(eq(orders.id, order.id));

  await sendShippingConfirmation(order.id);
  return { shipment, labelBase64: result.labelBase64 };
}

export async function sendShippingConfirmation(orderId: string): Promise<boolean> {
  const order = await getOrderById(orderId);
  if (!order) return false;
  const shipment = order.shipments[0];
  const mail = shippingConfirmationMail({
    ...mailData(order),
    trackingNumber: shipment?.trackingNumber ?? undefined,
    trackingUrl: shipment?.trackingUrl ?? undefined,
  });
  const sent = await sendMail({ to: order.email, subject: mail.subject, html: mail.html });
  if (sent && shipment) {
    await db.update(shipments).set({ notifiedAt: new Date() }).where(eq(shipments.id, shipment.id));
  }
  return sent;
}

export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Bestellung nicht gefunden");

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(orders.id, orderId));

    // Noch nicht bezahlte Bestellungen: Reservierung lösen.
    // Bereits bezahlte: Ware zurück in den Bestand.
    for (const item of order.items) {
      const patch =
        order.paymentStatus === "paid"
          ? { quantity: sql`${inventory.quantity} + ${item.quantity}` }
          : { reserved: sql`greatest(${inventory.reserved} - ${item.quantity}, 0)` };
      await tx
        .update(inventory)
        .set(patch)
        .where(
          and(
            eq(inventory.productId, item.productId!),
            item.variantId ? eq(inventory.variantId, item.variantId) : sql`${inventory.variantId} is null`,
          ),
        );
    }
  });

  const mail = cancellationMail({ ...mailData(order), reason });
  await sendMail({ to: order.email, subject: mail.subject, html: mail.html });
}

export async function recordRefund(params: {
  orderId: string;
  paymentId: string | null;
  providerRefundId: string;
  amountCents: number;
  reason?: string;
  adminUserId?: string | null;
}): Promise<void> {
  const order = await getOrderById(params.orderId);
  if (!order) throw new Error("Bestellung nicht gefunden");

  const refundedTotal = order.refundedCents + params.amountCents;
  const fullyRefunded = refundedTotal >= order.totalCents;

  await db.transaction(async (tx) => {
    await tx.insert(refunds).values({
      orderId: params.orderId,
      paymentId: params.paymentId,
      providerRefundId: params.providerRefundId,
      amountCents: params.amountCents,
      reason: params.reason ?? null,
      status: "succeeded",
      createdByAdminId: params.adminUserId ?? null,
    });

    await tx
      .update(orders)
      .set({
        refundedCents: refundedTotal,
        paymentStatus: fullyRefunded ? "refunded" : "partially_refunded",
        status: fullyRefunded ? "refunded" : order.status,
      })
      .where(eq(orders.id, params.orderId));
  });

  const mail = refundMail({ ...mailData(order), refundAmountCents: params.amountCents });
  await sendMail({ to: order.email, subject: mail.subject, html: mail.html });
}

export async function addAdminNote(orderId: string, note: string, admin: { id: string; name: string }) {
  await db.insert(adminNotes).values({
    orderId,
    adminUserId: admin.id,
    authorName: admin.name,
    note,
  });
}

function mailData(order: Awaited<ReturnType<typeof withDetails>>): OrderMailData {
  return {
    orderNumber: order.orderNumber,
    customerName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim(),
    items: order.items.map((item) => ({
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      totalCents: item.totalCents,
    })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    shippingMethodLabel: order.shippingMethod === "dhl_express" ? "DHL Express" : "DHL Paket",
    orderUrl: `${siteUrl()}/bestellung/${order.orderNumber}`,
  };
}
