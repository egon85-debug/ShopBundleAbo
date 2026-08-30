import type { Metadata } from "next";

import { LegalPage, LegalSection, Placeholder } from "@/components/shop/LegalPage";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" intro="Angaben gemäß § 5 DDG (ehem. § 5 TMG).">
      <LegalSection heading="Anbieter">
        <p>
          <Placeholder>Firmenname</Placeholder>
          <br />
          <Placeholder>Straße und Hausnummer</Placeholder>
          <br />
          <Placeholder>PLZ Ort</Placeholder>
          <br />
          <Placeholder>Land</Placeholder>
        </p>
      </LegalSection>
      <LegalSection heading="Vertreten durch">
        <p><Placeholder>Geschäftsführung / Inhaber</Placeholder></p>
      </LegalSection>
      <LegalSection heading="Kontakt">
        <p>
          Telefon: <Placeholder>Telefonnummer</Placeholder>
          <br />
          E-Mail: <Placeholder>E-Mail-Adresse</Placeholder>
        </p>
      </LegalSection>
      <LegalSection heading="Registereintrag">
        <p>
          Registergericht: <Placeholder>Amtsgericht</Placeholder>
          <br />
          Registernummer: <Placeholder>HRB-Nummer</Placeholder>
        </p>
      </LegalSection>
      <LegalSection heading="Umsatzsteuer-Identifikationsnummer">
        <p>Gemäß § 27a UStG: <Placeholder>USt-IdNr.</Placeholder></p>
      </LegalSection>
      <LegalSection heading="Verbraucherstreitbeilegung">
        <p>
          Angaben zur Teilnahme oder Nichtteilnahme an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle: <Placeholder>Angabe ergänzen</Placeholder>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
