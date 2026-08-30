import type { Metadata } from "next";

import { LegalPage, LegalSection, Placeholder } from "@/components/shop/LegalPage";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

export default function DatenschutzPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      intro="Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO."
    >
      <LegalSection heading="Verantwortliche Stelle">
        <p>
          <Placeholder>Firmenname, Anschrift, Kontakt</Placeholder>
          <br />
          Datenschutzbeauftragte(r): <Placeholder>falls bestellt, Name und Kontakt</Placeholder>
        </p>
      </LegalSection>

      <LegalSection heading="Welche Daten wir im Bestellprozess verarbeiten">
        <p>
          Zur Vertragsabwicklung (Art. 6 Abs. 1 lit. b DSGVO) verarbeiten wir: Name, Firma,
          Liefer- und Rechnungsanschrift, E-Mail-Adresse, optional Telefonnummer, Bestellinhalt
          sowie Zahlungs- und Versandstatus.
        </p>
      </LegalSection>

      <LegalSection heading="Zahlungsabwicklung (Stripe)">
        <p>
          Zahlungen werden über Stripe abgewickelt. Zahlungsdaten wie Kartennummern werden
          ausschließlich von Stripe verarbeitet und niemals auf unseren Servern gespeichert. Wir
          erhalten lediglich Zahlungsstatus und eine Transaktionskennung.
          Anbieter: <Placeholder>Stripe-Gesellschaft und Anschrift ergänzen</Placeholder>.
        </p>
      </LegalSection>

      <LegalSection heading="Versand (DHL / DHL Express)">
        <p>
          Zur Zustellung übermitteln wir Empfängername, Anschrift und – sofern angegeben –
          E-Mail-Adresse und Telefonnummer an DHL bzw. DHL Express.
          Anbieter: <Placeholder>DHL-Gesellschaft und Anschrift ergänzen</Placeholder>.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies und Sitzungen">
        <p>
          Technisch notwendige Cookies speichern Warenkorb und Anmeldesitzung. Sie sind für den
          Betrieb erforderlich und werden ohne Einwilligung gesetzt (§ 25 Abs. 2 TDDDG). Weitere
          Cookies setzen wir nur nach Ihrer Einwilligung.
        </p>
      </LegalSection>

      <LegalSection heading="Speicherdauer">
        <p>
          Bestelldaten bewahren wir entsprechend der handels- und steuerrechtlichen
          Aufbewahrungspflichten auf (<Placeholder>i. d. R. 6 bzw. 10 Jahre – prüfen lassen</Placeholder>).
        </p>
      </LegalSection>

      <LegalSection heading="Ihre Rechte">
        <p>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit sowie Widerspruch. Zudem besteht ein Beschwerderecht bei einer
          Aufsichtsbehörde: <Placeholder>zuständige Aufsichtsbehörde ergänzen</Placeholder>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
