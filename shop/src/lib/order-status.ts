/** Statuswerte und ihre Beschriftungen – eine Quelle für Shop, Admin und E-Mails. */

export const ORDER_STATUS = {
  new: "Neu",
  paid: "Bezahlt",
  processing: "In Bearbeitung",
  ready_to_ship: "Versandbereit",
  shipped: "Versendet",
  delivered: "Zugestellt",
  cancelled: "Storniert",
  refunded: "Erstattet",
} as const;

export const PAYMENT_STATUS = {
  pending: "Ausstehend",
  paid: "Bezahlt",
  failed: "Fehlgeschlagen",
  cancelled: "Storniert",
  refunded: "Erstattet",
  partially_refunded: "Teilweise erstattet",
} as const;

export const FULFILLMENT_STATUS = {
  pending: "Offen",
  ready_to_ship: "Versandbereit",
  shipped: "Versendet",
  delivered: "Zugestellt",
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS;
export type PaymentStatus = keyof typeof PAYMENT_STATUS;
export type FulfillmentStatus = keyof typeof FULFILLMENT_STATUS;

/** Reihenfolge des Bestellworkflows (Punkt 19) – für die Fortschrittsanzeige. */
export const WORKFLOW_STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "new", label: "Bestellung eingegangen", hint: "Zahlung wird erwartet" },
  { status: "paid", label: "Zahlung bestätigt", hint: "Von Stripe serverseitig bestätigt" },
  { status: "processing", label: "Kommissionierung", hint: "Ware wird zusammengestellt" },
  { status: "ready_to_ship", label: "Versandbereit", hint: "Etikett kann erstellt werden" },
  { status: "shipped", label: "Versendet", hint: "Tracking an Kundschaft übermittelt" },
  { status: "delivered", label: "Zugestellt", hint: "Bestellung abgeschlossen" },
];

export function workflowIndex(status: OrderStatus): number {
  const index = WORKFLOW_STEPS.findIndex((step) => step.status === status);
  return index === -1 ? 0 : index;
}

export function statusTone(status: OrderStatus | PaymentStatus | FulfillmentStatus): "ok" | "warn" | "danger" | "neutral" {
  if (["paid", "shipped", "delivered"].includes(status)) return "ok";
  if (["new", "pending", "processing", "ready_to_ship"].includes(status)) return "warn";
  if (["failed", "cancelled", "refunded", "partially_refunded"].includes(status)) return "danger";
  return "neutral";
}
