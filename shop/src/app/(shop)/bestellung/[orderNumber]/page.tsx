import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCents } from "@/lib/money";
import { FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS, WORKFLOW_STEPS, workflowIndex, type OrderStatus } from "@/lib/order-status";
import { getOrderByNumber } from "@/services/orders";

export const metadata: Metadata = { title: "Bestellung", robots: { index: false } };

/** Öffentliche Bestellübersicht (Bestellnummer ist der Zugriffsschlüssel). */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orderNumber }, query] = await Promise.all([params, searchParams]);
  const order = await getOrderByNumber(decodeURIComponent(orderNumber));
  if (!order) notFound();

  const justPaid = query.bezahlt === "1";
  const currentStep = workflowIndex(order.status as OrderStatus);
  const shipment = order.shipments[0];

  return (
    <div className="section py-12">
      {justPaid && order.paymentStatus !== "failed" && (
        <div className="mb-8 rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-6">
          <p className="font-display text-xl font-extrabold text-emerald-800">Vielen Dank für Ihre Bestellung!</p>
          <p className="mt-1 text-[15px] text-emerald-900">
            {order.paymentStatus === "paid"
              ? "Ihre Zahlung wurde bestätigt. Wir bereiten den Versand vor."
              : "Ihre Zahlung wird gerade von Stripe bestätigt – der Status aktualisiert sich automatisch."}
          </p>
        </div>
      )}

      <p className="eyebrow">Bestellung</p>
      <h1 className="mt-3 font-display text-display-lg font-extrabold">
        <span className="font-mono">{order.orderNumber}</span>
      </h1>
      <p className="mt-2 text-mist-700">
        Bestellt am{" "}
        {new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(
          order.placedAt ?? order.createdAt,
        )}
      </p>

      {/* Fortschritt des Bestellworkflows */}
      <ol className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {WORKFLOW_STEPS.map((step, index) => {
          const done = index <= currentStep;
          const cancelled = order.status === "cancelled" || order.status === "refunded";
          return (
            <li
              key={step.status}
              className={`rounded-xl border p-4 ${
                cancelled
                  ? "border-mist-200 bg-mist-50 opacity-60"
                  : done
                    ? "border-signal-500 bg-signal-50"
                    : "border-mist-200 bg-white"
              }`}
            >
              <span className={`font-mono text-xs ${done && !cancelled ? "text-signal-600" : "text-mist-500"}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-1 font-display text-sm font-bold leading-tight">{step.label}</p>
            </li>
          );
        })}
      </ol>

      {(order.status === "cancelled" || order.status === "refunded") && (
        <p className="mt-4 rounded-xl bg-red-50 p-4 font-semibold text-red-700">
          Diese Bestellung wurde {order.status === "refunded" ? "erstattet" : "storniert"}.
        </p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-display text-xl font-bold">Artikel</h2>
            <ul className="mt-5 divide-y divide-mist-200">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-mist-100">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      {item.variantName && <p className="text-sm text-mist-700">{item.variantName}</p>}
                      <p className="code-chip mt-1">{item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular">{formatCents(item.totalCents)}</p>
                      <p className="text-sm text-mist-500 tabular">{item.quantity} × {formatCents(item.unitPriceCents)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {shipment && (
            <section className="card p-6">
              <h2 className="font-display text-xl font-bold">Sendungsverfolgung</h2>
              <dl className="mt-4 space-y-2 text-[15px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-mist-700">Versandart</dt>
                  <dd className="font-semibold">{shipment.carrier === "dhl_express" ? "DHL Express" : "DHL Paket"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mist-700">Sendungsnummer</dt>
                  <dd className="font-mono">{shipment.trackingNumber}</dd>
                </div>
              </dl>
              {shipment.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5">
                  Sendung verfolgen
                </a>
              )}
              {order.events.length > 0 && (
                <ul className="mt-6 space-y-3 border-t border-mist-200 pt-5">
                  {order.events.map((event) => (
                    <li key={event.id} className="flex gap-3 text-sm">
                      <span className="font-mono text-mist-500">
                        {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}
                      </span>
                      <span>
                        <span className="font-semibold">{event.status}</span>
                        {event.description && <span className="text-mist-700"> — {event.description}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="card grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-lg font-bold">Lieferadresse</h2>
              <address className="mt-2 not-italic text-[15px] leading-relaxed text-mist-700">
                {order.shippingAddress.company && <>{order.shippingAddress.company}<br /></>}
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />
                {order.shippingAddress.street} {order.shippingAddress.houseNumber}<br />
                {order.shippingAddress.zip} {order.shippingAddress.city}<br />
                {order.shippingAddress.country}
              </address>
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Rechnungsadresse</h2>
              <address className="mt-2 not-italic text-[15px] leading-relaxed text-mist-700">
                {order.billingAddress.company && <>{order.billingAddress.company}<br /></>}
                {order.billingAddress.firstName} {order.billingAddress.lastName}<br />
                {order.billingAddress.street} {order.billingAddress.houseNumber}<br />
                {order.billingAddress.zip} {order.billingAddress.city}<br />
                {order.billingAddress.country}
              </address>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="font-display text-xl font-bold">Status</h2>
            <dl className="mt-4 space-y-3 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-mist-700">Bestellung</dt>
                <dd className="font-semibold">{ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mist-700">Zahlung</dt>
                <dd className="font-semibold">{PAYMENT_STATUS[order.paymentStatus as keyof typeof PAYMENT_STATUS]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mist-700">Versand</dt>
                <dd className="font-semibold">{FULFILLMENT_STATUS[order.fulfillmentStatus as keyof typeof FULFILLMENT_STATUS]}</dd>
              </div>
            </dl>

            <dl className="mt-6 space-y-2.5 border-t border-mist-200 pt-5 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-mist-700">Zwischensumme</dt>
                <dd className="tabular">{formatCents(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-700">Versand</dt>
                <dd className="tabular">{formatCents(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-mist-500">enthaltene MwSt.</dt>
                <dd className="text-mist-500 tabular">{formatCents(order.taxCents)}</dd>
              </div>
              {order.refundedCents > 0 && (
                <div className="flex justify-between text-sm">
                  <dt className="text-mist-500">erstattet</dt>
                  <dd className="text-mist-500 tabular">−{formatCents(order.refundedCents)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t-2 border-carbon-900 pt-3">
                <dt className="font-display text-lg font-extrabold">Gesamt</dt>
                <dd className="font-display text-lg font-extrabold tabular">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>

            <Link href="/shop" className="btn-ghost mt-6 w-full">Weiter einkaufen</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
