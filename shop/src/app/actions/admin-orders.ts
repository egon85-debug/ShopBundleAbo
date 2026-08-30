"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUS } from "@/lib/order-status";
import { ShippingError } from "@/lib/shipping/types";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import {
  addAdminNote,
  cancelOrder,
  createShippingLabel,
  recordRefund,
  sendShippingConfirmation,
} from "@/services/orders";

export type AdminActionState = { ok: boolean; message?: string };

/** Bestellstatus manuell ändern (auditiert). */
export async function updateOrderStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      status: z.enum(Object.keys(ORDER_STATUS) as [string, ...string[]]),
    })
    .safeParse({ orderId: formData.get("orderId"), status: formData.get("status") });

  if (!parsed.success) return { ok: false, message: "Ungültiger Status." };

  const [order] = await db.select().from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);
  if (!order) return { ok: false, message: "Bestellung nicht gefunden." };

  if (parsed.data.status === "cancelled") {
    await cancelOrder(order.id, "Storniert im Adminbereich");
  } else {
    await db
      .update(orders)
      .set({
        status: parsed.data.status,
        fulfillmentStatus:
          parsed.data.status === "ready_to_ship"
            ? "ready_to_ship"
            : parsed.data.status === "shipped"
              ? "shipped"
              : parsed.data.status === "delivered"
                ? "delivered"
                : order.fulfillmentStatus,
      })
      .where(eq(orders.id, order.id));
  }

  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "order",
    entityId: order.id,
    action: "status_change",
    field: "status",
    oldValue: order.status,
    newValue: parsed.data.status,
  });

  revalidatePath(`/admin/bestellungen/${order.id}`);
  revalidatePath("/admin/bestellungen");
  return { ok: true, message: `Status auf „${ORDER_STATUS[parsed.data.status as keyof typeof ORDER_STATUS]}“ gesetzt.` };
}

/** Versandetikett über DHL bzw. DHL Express erzeugen. */
export async function createLabelAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const carrier = String(formData.get("carrier") ?? "") || undefined;

  try {
    const { shipment } = await createShippingLabel(orderId, carrier as "dhl_paket" | "dhl_express" | undefined);
    await logAudit({
      adminUserId: admin.id,
      adminName: admin.name,
      entityType: "order",
      entityId: orderId,
      action: "label_created",
      newValue: shipment.trackingNumber,
    });
    revalidatePath(`/admin/bestellungen/${orderId}`);
    return { ok: true, message: `Versandetikett erstellt. Sendungsnummer ${shipment.trackingNumber}.` };
  } catch (error) {
    // Fehlende Zugangsdaten werden klar benannt, nicht als technischer Fehler getarnt.
    const message =
      error instanceof ShippingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Versandetikett konnte nicht erstellt werden.";
    return { ok: false, message };
  }
}

export async function resendShippingMailAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const sent = await sendShippingConfirmation(orderId);
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "order",
    entityId: orderId,
    action: "shipping_mail_sent",
  });
  return sent
    ? { ok: true, message: "Versandbestätigung versendet." }
    : { ok: false, message: "E-Mail konnte nicht versendet werden – SMTP-Zugang prüfen." };
}

/** Erstattung über Stripe auslösen (ganz oder teilweise). */
export async function refundOrderAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const amountEuro = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const reason = String(formData.get("reason") ?? "") || undefined;

  if (!Number.isFinite(amountEuro) || amountEuro <= 0) {
    return { ok: false, message: "Bitte einen gültigen Betrag angeben." };
  }
  if (!stripeConfigured()) {
    return { ok: false, message: "Stripe ist nicht konfiguriert – Erstattung nicht möglich." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, message: "Bestellung nicht gefunden." };

  const amountCents = Math.round(amountEuro * 100);
  if (amountCents + order.refundedCents > order.totalCents) {
    return { ok: false, message: "Der Betrag übersteigt den noch erstattbaren Rest." };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
  if (!payment?.providerPaymentId) {
    return { ok: false, message: "Keine Stripe-Zahlung zu dieser Bestellung gefunden." };
  }

  try {
    const refund = await getStripe().refunds.create({
      payment_intent: payment.providerPaymentId,
      amount: amountCents,
      metadata: { orderId, orderNumber: order.orderNumber },
    });

    await recordRefund({
      orderId,
      paymentId: payment.id,
      providerRefundId: refund.id,
      amountCents,
      reason,
      adminUserId: admin.id,
    });

    await logAudit({
      adminUserId: admin.id,
      adminName: admin.name,
      entityType: "order",
      entityId: orderId,
      action: "refund",
      newValue: `${(amountCents / 100).toFixed(2)} EUR`,
      reason,
    });

    revalidatePath(`/admin/bestellungen/${orderId}`);
    return { ok: true, message: `Erstattung über ${(amountCents / 100).toFixed(2)} € veranlasst.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Stripe meldet: ${error.message}` : "Erstattung fehlgeschlagen.",
    };
  }
}

export async function addOrderNoteAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { ok: false, message: "Bitte Notiztext eingeben." };

  await addAdminNote(orderId, note, { id: admin.id, name: admin.name });
  revalidatePath(`/admin/bestellungen/${orderId}`);
  return { ok: true, message: "Notiz gespeichert." };
}
