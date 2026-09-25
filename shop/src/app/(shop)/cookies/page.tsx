import type { Metadata } from "next";

import { CookieSettings } from "@/components/shop/CookieSettings";
import { Ueberschrift } from "@/components/ui/Gestaltung";

export const metadata: Metadata = { title: "Cookie-Einstellungen" };

export default function CookiesPage() {
  return (
    <div className="seite py-12 lg:py-16">
      <div className="mx-auto max-w-[70ch]">
        <Ueberschrift als="h1" groesse="gross" augenbraue="Datenschutz">Cookie-Einstellungen</Ueberschrift>
        <p className="mt-6 text-subheading text-kohle">
          Dieser Shop setzt standardmäßig ausschließlich technisch notwendige Cookies. Sie speichern
          Ihren Warenkorb und – falls angemeldet – Ihre Sitzung.
        </p>
        <CookieSettings />
      </div>
    </div>
  );
}
