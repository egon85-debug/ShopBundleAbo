import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProduktBild, Ueberschrift } from "@/components/ui/Gestaltung";
import type { AddressSnapshot } from "@/db/schema";
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

  const storniert = order.status === "cancelled" || order.status === "refunded";

  return (
    <div className="seite py-12 lg:py-16">
      {justPaid && order.paymentStatus !== "failed" && (
        <div className="karte-hervor mb-12 p-6">
          <p className="text-heading-sm font-light">Vielen Dank für Ihre Bestellung!</p>
          <p className="mt-2 text-body text-kohle">
            {order.paymentStatus === "paid"
              ? "Ihre Zahlung wurde bestätigt. Wir bereiten den Versand vor."
              : "Ihre Zahlung wird gerade von Stripe bestätigt – der Status aktualisiert sich automatisch."}
          </p>
        </div>
      )}

      <Ueberschrift als="h1" groesse="gross" augenbraue="Bestellung">
        {order.orderNumber}
      </Ueberschrift>
      <p className="mt-6 text-kohle">
        Bestellt am{" "}
        {new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(
          order.placedAt ?? order.createdAt,
        )}
      </p>

      {/* Fortschritt des Bestellablaufs: der aktuelle Schritt trägt die Plakette. */}
      {/* Am Handy nur der aktuelle Schritt, ab sm die ganze Zeile. */}
      <ol className={`mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-6 ${storniert ? "opacity-50" : ""}`}>
        {WORKFLOW_STEPS.map((step, index) => {
          const aktuell = !storniert && index === currentStep;
          const erledigt = index < currentStep;
          return (
            <li
              key={step.status}
              aria-current={aktuell ? "step" : undefined}
              className={aktuell || storniert ? undefined : "hidden sm:block"}
            >
              <span className={aktuell ? "plakette-aktiv" : `plakette px-0 ${erledigt ? "text-kohle" : "text-asche"}`}>
                {erledigt ? "✓ " : ""}Schritt {index + 1}
                {aktuell && <span className="sm:hidden"> von {WORKFLOW_STEPS.length}</span>}
              </span>
              <p
                className={`mt-2 pb-2 text-body ${
                  aktuell ? "border-b-2 border-haarlinie font-medium text-tinte" : "border-b border-haarlinie text-kohle"
                }`}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>

      {storniert && (
        <p className="hinweis-fehler mt-6">
          Diese Bestellung wurde {order.status === "refunded" ? "erstattet" : "storniert"}.
        </p>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="karte p-6">
            <h2 className="text-heading-sm font-medium">Artikel</h2>
            <ul className="mt-4 divide-y divide-haarlinie">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4">
                  <ProduktBild url={item.imageUrl} alt="" klein className="h-16 w-16 shrink-0" />
                  <div className="flex flex-1 flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.variantName && <p className="text-body-sm text-kohle">{item.variantName}</p>}
                      <p className="nummer mt-1">{item.sku}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="tabular">{formatCents(item.totalCents)}</p>
                      <p className="text-body-sm text-schiefer tabular">{item.quantity} × {formatCents(item.unitPriceCents)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {shipment && (
            <section className="karte p-6">
              <h2 className="text-heading-sm font-medium">Sendungsverfolgung</h2>
              <dl className="mt-4 space-y-2 text-body">
                <div className="flex justify-between gap-4">
                  <dt className="text-kohle">Versandart</dt>
                  <dd>{shipment.carrier === "dhl_express" ? "DHL Express" : "DHL Paket"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-kohle">Sendungsnummer</dt>
                  <dd className="tabular">{shipment.trackingNumber}</dd>
                </div>
              </dl>
              {shipment.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="knopf-aktion mt-6">
                  Sendung verfolgen
                </a>
              )}
              {order.events.length > 0 && (
                <ul className="mt-6 space-y-3 border-t border-haarlinie pt-5">
                  {order.events.map((event) => (
                    <li key={event.id} className="flex gap-3 text-body-sm">
                      <span className="shrink-0 tabular text-schiefer">
                        {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}
                      </span>
                      <span>
                        <span className="font-medium">{event.status}</span>
                        {event.description && <span className="text-kohle"> — {event.description}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="karte grid gap-6 p-6 sm:grid-cols-2">
            <Adresse titel="Lieferadresse" adresse={order.shippingAddress} />
            <Adresse titel="Rechnungsadresse" adresse={order.billingAddress} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-40 lg:self-start">
          <div className="karte p-6">
            <h2 className="text-heading-sm font-medium">Status</h2>
            <dl className="mt-4 space-y-3 text-body">
              <div className="flex justify-between gap-3">
                <dt className="text-kohle">Bestellung</dt>
                <dd>{ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-kohle">Zahlung</dt>
                <dd>{PAYMENT_STATUS[order.paymentStatus as keyof typeof PAYMENT_STATUS]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-kohle">Versand</dt>
                <dd>{FULFILLMENT_STATUS[order.fulfillmentStatus as keyof typeof FULFILLMENT_STATUS]}</dd>
              </div>
            </dl>

            <dl className="mt-6 space-y-3 border-t border-haarlinie pt-5 text-body">
              <div className="flex justify-between">
                <dt className="text-kohle">Zwischensumme</dt>
                <dd className="tabular">{formatCents(order.subtotalCents)}</dd>
              </div>
              {order.depositCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-kohle">Pfand</dt>
                  <dd className="tabular">{formatCents(order.depositCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-kohle">Versand</dt>
                <dd className="tabular">{formatCents(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between text-body-sm">
                <dt className="text-schiefer">enthaltene MwSt.</dt>
                <dd className="text-schiefer tabular">{formatCents(order.taxCents)}</dd>
              </div>
              {order.refundedCents > 0 && (
                <div className="flex justify-between text-body-sm">
                  <dt className="text-schiefer">erstattet</dt>
                  <dd className="text-schiefer tabular">−{formatCents(order.refundedCents)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-haarlinie pt-4">
                <dt className="text-subheading font-medium">Gesamt</dt>
                <dd className="text-subheading font-medium tabular">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>

            <Link href="/shop" className="knopf-zweit mt-8 w-full">Weiter einkaufen</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Adresse({ titel, adresse }: { titel: string; adresse: AddressSnapshot }) {
  return (
    <div>
      <h2 className="text-subheading font-medium">{titel}</h2>
      <address className="mt-2 not-italic text-body text-kohle">
        {adresse.company && <>{adresse.company}<br /></>}
        {adresse.firstName} {adresse.lastName}<br />
        {adresse.street} {adresse.houseNumber}<br />
        {adresse.zip} {adresse.city}<br />
        {adresse.country}
      </address>
    </div>
  );
}
