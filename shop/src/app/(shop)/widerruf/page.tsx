import type { Metadata } from "next";

import { LegalPage, LegalSection, Placeholder } from "@/components/shop/LegalPage";

export const metadata: Metadata = { title: "Widerrufsbelehrung" };

export default function WiderrufPage() {
  return (
    <LegalPage title="Widerrufsbelehrung" intro="Informationen zum Widerrufsrecht für Verbraucher.">
      <LegalSection heading="Widerrufsrecht">
        <p>
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
          widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von
          Ihnen benannter Dritter die Waren in Besitz genommen haben.
        </p>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns
          (<Placeholder>Firmenname, Anschrift, Telefon, E-Mail</Placeholder>) mittels einer
          eindeutigen Erklärung über Ihren Entschluss informieren.
        </p>
      </LegalSection>
      <LegalSection heading="Folgen des Widerrufs">
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen einschließlich der
          Lieferkosten unverzüglich und spätestens binnen vierzehn Tagen zurückzuzahlen.
        </p>
      </LegalSection>
      <LegalSection heading="Muster-Widerrufsformular">
        <p><Placeholder>Muster-Widerrufsformular nach gesetzlicher Vorlage ergänzen</Placeholder></p>
      </LegalSection>
    </LegalPage>
  );
}
