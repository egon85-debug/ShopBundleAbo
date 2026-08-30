import type { Metadata } from "next";

import { CookieSettings } from "@/components/shop/CookieSettings";

export const metadata: Metadata = { title: "Cookie-Einstellungen" };

export default function CookiesPage() {
  return (
    <div className="section py-12">
      <div className="mx-auto max-w-[70ch]">
        <p className="eyebrow">Datenschutz</p>
        <h1 className="mt-3 font-display text-display-lg font-extrabold">Cookie-Einstellungen</h1>
        <p className="mt-4 text-lg text-mist-700">
          Dieser Shop setzt standardmäßig ausschließlich technisch notwendige Cookies. Sie speichern
          Ihren Warenkorb und – falls angemeldet – Ihre Sitzung.
        </p>
        <CookieSettings />
      </div>
    </div>
  );
}
