import type { Metadata } from "next";

import { Ueberschrift } from "@/components/ui/Gestaltung";

export const metadata: Metadata = {
  title: "Zahlungsarten",
  description: "Sichere Zahlung über Stripe – Karte, Apple Pay, Google Pay und weitere Methoden.",
};

export default function ZahlungPage() {
  return (
    <div className="seite py-12 lg:py-16">
      <div className="mx-auto max-w-[70ch]">
        <Ueberschrift als="h1" groesse="gross" augenbraue="Service">Zahlungsarten</Ueberschrift>
        <p className="mt-6 text-subheading text-kohle">
          Alle Zahlungen werden über Stripe abgewickelt – einen der führenden europäischen
          Zahlungsdienstleister.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {[
            ["Kredit- und Debitkarte", "Visa, Mastercard, American Express"],
            ["Apple Pay", "Auf unterstützten Apple-Geräten"],
            ["Google Pay", "Auf unterstützten Android-Geräten"],
            ["Weitere Methoden", "Je nach Land und Freischaltung im Stripe-Konto"],
          ].map(([title, text]) => (
            <div key={title} className="karte p-6">
              <h2 className="text-subheading font-medium">{title}</h2>
              <p className="mt-2 text-body-sm text-kohle">{text}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 space-y-8 text-body text-kohle">
          <div>
            <h2 className="text-heading-sm font-medium text-tinte">Sicherheit</h2>
            <p className="mt-3">
              Ihre Zahlungsdaten werden ausschließlich von Stripe verarbeitet und niemals auf unseren
              Servern gespeichert. Die Bestellung wird erst dann als bezahlt geführt, wenn Stripe den
              Zahlungseingang serverseitig bestätigt hat.
            </p>
          </div>
          <div>
            <h2 className="text-heading-sm font-medium text-tinte">Rückerstattungen</h2>
            <p className="mt-3">
              Erstattungen werden über dasselbe Zahlungsmittel zurückgeführt. Je nach Bank dauert die
              Gutschrift zwei bis zehn Werktage.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
