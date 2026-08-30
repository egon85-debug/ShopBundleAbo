import type { Metadata } from "next";

import { LegalPage, LegalSection, Placeholder } from "@/components/shop/LegalPage";

export const metadata: Metadata = { title: "Allgemeine Geschäftsbedingungen" };

export default function AgbPage() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen" intro="Gültig für alle Bestellungen über diesen Onlineshop.">
      <LegalSection heading="§ 1 Geltungsbereich">
        <p>
          Diese Bedingungen gelten für alle Verträge zwischen <Placeholder>Firmenname</Placeholder> und
          den Kundinnen und Kunden dieses Shops.
        </p>
      </LegalSection>
      <LegalSection heading="§ 2 Vertragsschluss">
        <p>
          Mit dem Klick auf „Zahlungspflichtig bestellen“ geben Sie ein verbindliches Angebot ab.
          Der Vertrag kommt mit unserer Auftragsbestätigung bzw. dem Versand der Ware zustande.
        </p>
      </LegalSection>
      <LegalSection heading="§ 3 Preise und Versandkosten">
        <p>
          Alle Preise sind Endpreise inklusive gesetzlicher Mehrwertsteuer zuzüglich Versandkosten.
          Die Versandkosten werden im Checkout vor Abgabe der Bestellung ausgewiesen.
        </p>
      </LegalSection>
      <LegalSection heading="§ 4 Lieferung">
        <p>
          Die Lieferung erfolgt mit DHL oder DHL Express an die angegebene Lieferadresse.
          Lieferzeiten: <Placeholder>Lieferzeiten und Liefergebiete ergänzen</Placeholder>.
        </p>
      </LegalSection>
      <LegalSection heading="§ 5 Zahlung">
        <p>
          Die Zahlung erfolgt über die im Checkout angebotenen Zahlungsarten (Stripe).
        </p>
      </LegalSection>
      <LegalSection heading="§ 6 Eigentumsvorbehalt">
        <p>Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.</p>
      </LegalSection>
      <LegalSection heading="§ 7 Gewährleistung">
        <p>Es gelten die gesetzlichen Gewährleistungsrechte.</p>
      </LegalSection>
      <LegalSection heading="§ 8 Sonstiges">
        <p><Placeholder>Weitere Regelungen und Gerichtsstand ergänzen</Placeholder></p>
      </LegalSection>
    </LegalPage>
  );
}
