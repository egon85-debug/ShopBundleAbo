import type { Metadata } from "next";

import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";

export const metadata: Metadata = {
  title: "Versandinformationen",
  description: "Versandarten, Kosten und Lieferzeiten bei Winterfeld Logistik.",
};

export default function VersandPage() {
  const options = shippingOptions();

  return (
    <div className="section py-12">
      <div className="mx-auto max-w-[70ch]">
        <p className="eyebrow">Service</p>
        <h1 className="mt-3 font-display text-display-lg font-extrabold">Versandinformationen</h1>
        <p className="mt-4 text-lg text-mist-700">
          Wir versenden mit DHL und DHL Express. Sobald Ihre Sendung das Lager verlässt, erhalten Sie
          automatisch eine Versandbestätigung mit Sendungsnummer und Tracking-Link.
        </p>

        <div className="mt-10 space-y-4">
          {options.map((option) => (
            <div key={option.code} className="card flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <h2 className="font-display text-xl font-bold">{option.label}</h2>
                <p className="mt-1 text-mist-700">Lieferzeit {option.deliveryEstimate}</p>
              </div>
              <p className="font-display text-2xl font-extrabold tabular">{formatCents(option.priceCents)}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 space-y-6 text-[16px] leading-relaxed text-mist-700">
          <div>
            <h2 className="font-display text-xl font-bold text-carbon-900">Ablauf</h2>
            <p className="mt-2">
              Nach bestätigter Zahlung wird Ihre Bestellung kommissioniert. Das Versandetikett wird
              über die DHL-Schnittstelle erzeugt, die Sendungsnummer gespeichert und Ihnen per E-Mail
              zugeschickt. Den aktuellen Status sehen Sie jederzeit auf Ihrer Bestellseite.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-carbon-900">Liefergebiete</h2>
            <p className="mt-2">
              Wir liefern innerhalb Deutschlands sowie in die im Checkout wählbaren Länder. Bei
              Sendungen außerhalb der EU können Zoll- und Einfuhrabgaben anfallen, die von der
              Empfängerin oder dem Empfänger zu tragen sind.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
