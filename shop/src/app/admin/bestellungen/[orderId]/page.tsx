import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/admin/OrderActions";
import { StatusBadge } from "@/components/admin/Charts";
import { formatCents } from "@/lib/money";
import {
  FULFILLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  WORKFLOW_STEPS,
  statusTone,
  workflowIndex,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import { shippingOptions } from "@/lib/shipping/registry";
import { getOrderById } from "@/services/orders";

export const metadata: Metadata = { title: "Bestelldetails", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) notFound();

  const currentStep = workflowIndex(order.status as OrderStatus);
  const shipment = order.shipments[0];
  const label = order.labels[0];
  const refundable = order.totalCents - order.refundedCents;
  const options = shippingOptions();

  return (
    <>
      <Link href="/admin/bestellungen" className="text-sm font-semibold text-signal-600 hover:underline">
        ← Zurück zur Übersicht
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-extrabold">
            <span className="font-mono">{order.orderNumber}</span>
          </h1>
          <p className="mt-1 text-mist-700">
            {new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(
              order.placedAt ?? order.createdAt,
            )}{" "}
            · {order.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={ORDER_STATUS[order.status as OrderStatus]} tone={statusTone(order.status as OrderStatus)} />
          <StatusBadge label={PAYMENT_STATUS[order.paymentStatus as PaymentStatus]} tone={statusTone(order.paymentStatus as PaymentStatus)} />
          <StatusBadge label={FULFILLMENT_STATUS[order.fulfillmentStatus as FulfillmentStatus]} tone={statusTone(order.fulfillmentStatus as FulfillmentStatus)} />
        </div>
      </div>

      {/* Workflow-Fortschritt: wo steht die Bestellung gerade? */}
      <ol className="mt-8 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {WORKFLOW_STEPS.map((step, index) => {
          const done = index <= currentStep;
          return (
            <li key={step.status} className={`rounded-xl border p-3 ${done ? "border-signal-500 bg-signal-50" : "border-mist-200 bg-white"}`}>
              <span className={`font-mono text-xs ${done ? "text-signal-600" : "text-mist-500"}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-0.5 font-display text-sm font-bold leading-tight">{step.label}</p>
              <p className="mt-0.5 text-xs text-mist-700">{step.hint}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-display text-xl font-bold">Artikel</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[15px]">
                <thead>
                  <tr className="border-b border-mist-200 text-xs uppercase tracking-[.08em] text-mist-700">
                    <th className="pb-2 font-display">Artikel</th>
                    <th className="pb-2 font-display">SKU</th>
                    <th className="pb-2 text-right font-display">Menge</th>
                    <th className="pb-2 text-right font-display">Einzel</th>
                    <th className="pb-2 text-right font-display">Summe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist-200">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3">
                        <span className="font-semibold">{item.name}</span>
                        {item.variantName && <span className="block text-sm text-mist-700">{item.variantName}</span>}
                      </td>
                      <td className="py-3 font-mono text-sm">{item.sku}</td>
                      <td className="py-3 text-right tabular">{item.quantity}</td>
                      <td className="py-3 text-right tabular">{formatCents(item.unitPriceCents)}</td>
                      <td className="py-3 text-right font-semibold tabular">{formatCents(item.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="mt-5 space-y-2 border-t border-mist-200 pt-5 text-[15px]">
              <div className="flex justify-between"><dt className="text-mist-700">Zwischensumme</dt><dd className="tabular">{formatCents(order.subtotalCents)}</dd></div>
              {order.depositCents > 0 && (
                <div className="flex justify-between"><dt className="text-mist-700">Pfand</dt><dd className="tabular">{formatCents(order.depositCents)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-mist-700">Versand</dt><dd className="tabular">{formatCents(order.shippingCents)}</dd></div>
              <div className="flex justify-between text-sm"><dt className="text-mist-500">enthaltene MwSt.</dt><dd className="text-mist-500 tabular">{formatCents(order.taxCents)}</dd></div>
              {order.refundedCents > 0 && (
                <div className="flex justify-between text-sm"><dt className="text-mist-500">erstattet</dt><dd className="text-mist-500 tabular">−{formatCents(order.refundedCents)}</dd></div>
              )}
              <div className="flex justify-between border-t-2 border-carbon-900 pt-3">
                <dt className="font-display text-lg font-extrabold">Gesamt</dt>
                <dd className="font-display text-lg font-extrabold tabular">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>
          </section>

          <section className="card grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-lg font-bold">Lieferadresse</h2>
              <address className="mt-2 not-italic text-[15px] leading-relaxed text-mist-700">
                {order.shippingAddress.company && <>{order.shippingAddress.company}<br /></>}
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />
                {order.shippingAddress.street} {order.shippingAddress.houseNumber}<br />
                {order.shippingAddress.addressAddition && <>{order.shippingAddress.addressAddition}<br /></>}
                {order.shippingAddress.zip} {order.shippingAddress.city}<br />
                {order.shippingAddress.country}
                {order.phone && <><br />Tel. {order.phone}</>}
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

          {order.customerNote && (
            <section className="card p-6">
              <h2 className="font-display text-lg font-bold">Anmerkung der Kundschaft</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] text-mist-700">{order.customerNote}</p>
            </section>
          )}

          <section className="card p-6">
            <h2 className="font-display text-lg font-bold">Zahlungen</h2>
            {order.payments.length === 0 ? (
              <p className="mt-2 text-sm text-mist-700">Noch keine Zahlung erfasst.</p>
            ) : (
              <ul className="mt-3 divide-y divide-mist-200">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[15px]">
                    <span>
                      <span className="font-semibold">{formatCents(payment.amountCents)}</span>
                      <span className="ml-2 text-mist-700">{payment.method ?? payment.provider}</span>
                      {payment.providerPaymentId && (
                        <span className="mt-0.5 block font-mono text-xs text-mist-500">{payment.providerPaymentId}</span>
                      )}
                    </span>
                    <StatusBadge label={PAYMENT_STATUS[payment.status as PaymentStatus] ?? payment.status} tone={statusTone(payment.status as PaymentStatus)} />
                  </li>
                ))}
              </ul>
            )}

            {order.refunds.length > 0 && (
              <>
                <h3 className="mt-5 font-display text-sm font-bold uppercase tracking-[.08em] text-mist-700">Erstattungen</h3>
                <ul className="mt-2 divide-y divide-mist-200">
                  {order.refunds.map((refund) => (
                    <li key={refund.id} className="flex justify-between py-2 text-[15px]">
                      <span>
                        {formatCents(refund.amountCents)}
                        {refund.reason && <span className="ml-2 text-mist-700">({refund.reason})</span>}
                      </span>
                      <span className="font-mono text-xs text-mist-500">
                        {new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(refund.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {order.notes.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-lg font-bold">Interne Notizen</h2>
              <ul className="mt-3 space-y-3">
                {order.notes.map((note) => (
                  <li key={note.id} className="rounded-xl bg-mist-50 p-4">
                    <p className="text-[15px]">{note.note}</p>
                    <p className="mt-1.5 font-mono text-xs text-mist-500">
                      {note.authorName} ·{" "}
                      {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <OrderActions
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          paymentStatus={order.paymentStatus}
          shippingMethod={order.shippingMethod}
          refundableCents={refundable}
          shippingOptions={options}
          shipment={
            shipment
              ? {
                  trackingNumber: shipment.trackingNumber,
                  trackingUrl: shipment.trackingUrl,
                  carrier: shipment.carrier,
                  hasLabel: Boolean(label),
                  labelId: label?.id ?? null,
                }
              : null
          }
        />
      </div>
    </>
  );
}
