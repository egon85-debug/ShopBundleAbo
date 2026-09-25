import type { Metadata } from "next";

import { Ueberschrift } from "@/components/ui/Gestaltung";
import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";

export const metadata: Metadata = {
  title: "Versandinformationen",
  description: "Versandarten, Kosten und Lieferzeiten bei Winterfeld Logistik.",
};

export default function VersandPage() {
  const options = shippingOptions();

  return (
    <div className="seite py-12 lg:py-16">
      <div className="mx-auto max-w-[70ch]">
        <Ueberschrift als="h1" groesse="gross" augenbraue="Service">Versandinformationen</Ueberschrift>
        <p className="mt-6 text-subheading text-kohle">
          Wir versenden mit DHL und DHL Express. Sobald Ihre Sendung das Lager verlässt, erhalten Sie
          automatisch eine Versandbestätigung mit Sendungsnummer und Tracking-Link.
        </p>

        <div className="mt-12 divide-y divide-haarlinie border-y border-haarlinie">
          {options.map((option) => (
            <div key={option.code} className="flex flex-wrap items-center justify-between gap-4 py-6">
              <div>
                <h2 className="text-heading-sm font-medium">{option.label}</h2>
                <p className="mt-1 text-kohle">Lieferzeit {option.deliveryEstimate}</p>
              </div>
              <p className="text-heading-sm tabular">{formatCents(option.priceCents)}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 space-y-8 text-body text-kohle">
          <div>
            <h2 className="text-heading-sm font-medium text-tinte">Ablauf</h2>
            <p className="mt-3">
              Nach bestätigter Zahlung wird Ihre Bestellung kommissioniert. Das Versandetikett wird
              über die DHL-Schnittstelle erzeugt, die Sendungsnummer gespeichert und Ihnen per E-Mail
              zugeschickt. Den aktuellen Status sehen Sie jederzeit auf Ihrer Bestellseite.
            </p>
          </div>
          <div>
            <h2 className="text-heading-sm font-medium text-tinte">Liefergebiete</h2>
            <p className="mt-3">
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
