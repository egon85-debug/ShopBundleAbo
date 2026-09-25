import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { Archivo, JetBrains_Mono, Public_Sans } from "next/font/google";

import { adminLogoutAction } from "@/app/actions/admin-auth";
import { getCurrentAdmin } from "@/lib/auth";

// Die Schriften des Backoffice — der Shop nutzt nur Inter und lädt diese nicht.
const display = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});
const SCHRIFTEN = `${display.variable} ${body.variable} ${mono.variable} font-sans text-carbon-900`;

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/bestellungen", label: "Bestellungen" },
  { href: "/admin/produkte", label: "Produkte" },
  { href: "/admin/kategorien", label: "Kategorien" },
];

/**
 * Der gesamte Adminbereich wird immer frisch gerendert, nie vorab erzeugt.
 *
 * Backoffice-Seiten zeigen den aktuellen Stand hinter einer Anmeldung – eine
 * beim Deployment eingefrorene Fassung waere nicht nur veraltet, sie wuerde den
 * Build auch von der Erreichbarkeit der Datenbank abhaengig machen. Genau daran
 * ist er gescheitert: /admin/produkte/neu war die einzige Seite ohne diese
 * Festlegung und hat beim Vorrendern die Datenbank befragt.
 *
 * Die Angabe steht hier im Layout und gilt damit auch fuer jede Seite, die
 * spaeter dazukommt.
 */
export const dynamic = "force-dynamic";

/** Adminbereich: geschützt; ohne gültige Sitzung führt jeder Pfad zum Login. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const admin = await getCurrentAdmin();

  // Die Login-Seite rendert ohne Rahmen (und ohne Sitzung).
  if (pathname.endsWith("/admin/login")) return <div className={SCHRIFTEN}>{children}</div>;
  if (!admin) redirect("/admin/login");

  return (
    <div className={`flex min-h-screen flex-col bg-mist-50 ${SCHRIFTEN}`}>
      <header className="border-b border-mist-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-5">
          <Link href="/admin" className="flex flex-col leading-none">
            <span className="font-display text-[13px] font-extrabold tracking-[.14em]">WINTERFELD</span>
            <span className="font-mono text-[10px] tracking-[.18em] text-signal-600">BACKOFFICE</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1" aria-label="Adminbereich">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link href="/" className="hidden text-sm font-semibold text-mist-700 hover:text-carbon-900 sm:block">
            Zum Shop ↗
          </Link>
          <span className="hidden text-sm text-mist-700 md:block">{admin.name}</span>
          <form action={adminLogoutAction}>
            <button type="submit" className="btn-ghost px-4 py-2 text-sm">Abmelden</button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
