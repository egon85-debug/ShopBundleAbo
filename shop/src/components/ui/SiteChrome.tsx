import Link from "next/link";

import { CartBadge } from "@/components/ui/CartBadge";
import { FloatingHeader } from "@/components/ui/FloatingHeader";
import { navigationCategories } from "@/services/navigation";

/**
 * Kopf- und Fusszeile zeigen die Kategorien aus der Datenbank – zwischen-
 * gespeichert und mit Ersatzwert, damit eine kurzzeitig langsame oder nicht
 * erreichbare Datenbank keine Seite lahmlegt. Der Warenkorbzähler kommt aus
 * einem eigenen Aufruf im Browser (siehe CartBadge), weil er an einem Cookie
 * hängt und die Seiten sonst nicht mehr statisch ausgeliefert werden könnten.
 */

/** Kopfzeile mit dynamischer Kategorienavigation (nichts ist hartkodiert). */
export async function SiteHeader({ ueberHelden = false }: { ueberHelden?: boolean }) {
  const categories = await navigationCategories();

  return (
    <FloatingHeader ueberHelden={ueberHelden}>
      <div className="section flex h-full items-center gap-6">
        <Link href="/" className="flex shrink-0 flex-col leading-none">
          <span className="font-display text-[15px] font-extrabold tracking-[.14em] text-carbon-900">
            WINTERFELD
          </span>
          <span className="font-mono text-[10px] tracking-[.2em] text-signal-600">LOGISTIK</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Kategorien">
          <Link href="/shop" className="rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100">
            Alle Produkte
          </Link>
          {categories.slice(0, 5).map((category) => (
            <Link
              key={category.id}
              href={`/shop/${category.slug}`}
              className="rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <form action="/shop" className="ml-auto hidden max-w-xs flex-1 md:block" role="search">
          <input
            type="search"
            name="q"
            placeholder="Produkte suchen …"
            aria-label="Produkte suchen"
            className="field py-2.5 text-sm"
          />
        </form>

        <div className="flex items-center gap-1.5">
          <Link href="/konto" className="rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100">
            Konto
          </Link>
          <CartBadge />
        </div>
      </div>
    </FloatingHeader>
  );
}

export async function SiteFooter() {
  const categories = await navigationCategories();

  return (
    <footer className="mt-24 border-t border-carbon-700 bg-carbon-950 text-mist-300">
      <div className="section grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-extrabold tracking-[.14em] text-white">WINTERFELD</p>
          <p className="font-mono text-[11px] tracking-[.2em] text-signal-300">LOGISTIK</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Logistik. Einfach. Digital. Produkte bestellen, sicher bezahlen und zuverlässig mit DHL
            geliefert bekommen.
          </p>
        </div>

        <div>
          <p className="eyebrow text-signal-300">Sortiment</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/shop" className="hover:text-white">Alle Produkte</Link>
            </li>
            {categories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <Link href={`/shop/${category.slug}`} className="hover:text-white">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow text-signal-300">Service</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/versand" className="hover:text-white">Versandinformationen</Link></li>
            <li><Link href="/zahlung" className="hover:text-white">Zahlungsarten</Link></li>
            <li><Link href="/widerruf" className="hover:text-white">Widerrufsbelehrung</Link></li>
            <li><Link href="/konto/bestellungen" className="hover:text-white">Bestellungen &amp; Tracking</Link></li>
          </ul>
        </div>

        <div>
          <p className="eyebrow text-signal-300">Rechtliches</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/impressum" className="hover:text-white">Impressum</Link></li>
            <li><Link href="/datenschutz" className="hover:text-white">Datenschutz</Link></li>
            <li><Link href="/agb" className="hover:text-white">AGB</Link></li>
            <li><Link href="/cookies" className="hover:text-white">Cookie-Einstellungen</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-carbon-700">
        <div className="section flex flex-col gap-2 py-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Winterfeld Logistik</p>
          <p className="font-mono">Versand mit DHL &amp; DHL Express · Zahlung über Stripe</p>
        </div>
      </div>
    </footer>
  );
}
