import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zahlungsarten",
  description: "Sichere Zahlung über Stripe – Karte, Apple Pay, Google Pay und weitere Methoden.",
};

export default function ZahlungPage() {
  return (
    <div className="section py-12">
      <div className="mx-auto max-w-[70ch]">
        <p className="eyebrow">Service</p>
        <h1 className="mt-3 font-display text-display-lg font-extrabold">Zahlungsarten</h1>
        <p className="mt-4 text-lg text-mist-700">
          Alle Zahlungen werden über Stripe abgewickelt – einen der führenden europäischen
          Zahlungsdienstleister.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            ["Kredit- und Debitkarte", "Visa, Mastercard, American Express"],
            ["Apple Pay", "Auf unterstützten Apple-Geräten"],
            ["Google Pay", "Auf unterstützten Android-Geräten"],
            ["Weitere Methoden", "Je nach Land und Freischaltung im Stripe-Konto"],
          ].map(([title, text]) => (
            <div key={title} className="card p-6">
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <p className="mt-1.5 text-[15px] text-mist-700">{text}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 space-y-6 text-[16px] leading-relaxed text-mist-700">
          <div>
            <h2 className="font-display text-xl font-bold text-carbon-900">Sicherheit</h2>
            <p className="mt-2">
              Ihre Zahlungsdaten werden ausschließlich von Stripe verarbeitet und niemals auf unseren
              Servern gespeichert. Die Bestellung wird erst dann als bezahlt geführt, wenn Stripe den
              Zahlungseingang serverseitig bestätigt hat.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-carbon-900">Rückerstattungen</h2>
            <p className="mt-2">
              Erstattungen werden über dasselbe Zahlungsmittel zurückgeführt. Je nach Bank dauert die
              Gutschrift zwei bis zehn Werktage.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
