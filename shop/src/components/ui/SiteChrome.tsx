import Link from "next/link";

import { CartBadge } from "@/components/ui/CartBadge";
import { navigationCategories } from "@/services/navigation";

/**
 * Kopf- und Fusszeile zeigen die Kategorien aus der Datenbank – zwischen-
 * gespeichert und mit Ersatzwert, damit eine kurzzeitig langsame oder nicht
 * erreichbare Datenbank keine Seite lahmlegt. Der Warenkorbzähler kommt aus
 * einem eigenen Aufruf im Browser (siehe CartBadge), weil er an einem Cookie
 * hängt und die Seiten sonst nicht mehr statisch ausgeliefert werden könnten.
 */

function Wortmarke() {
  return (
    <Link href="/" className="shrink-0" aria-label="Winterfeld Logistik – Startseite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marke/winterfeld-logistik.svg" alt="" width={147} height={24} className="h-6 w-auto" />
    </Link>
  );
}

/** Kopfzeile: Hinweisleiste, Wortmarke, Kategorien, Suche, Konto, Warenkorb. */
export async function SiteHeader() {
  const categories = await navigationCategories();

  return (
    <header className="sticky top-0 z-50 bg-white">
      {/* Hinweisleiste */}
      <div className="bg-leinen">
        <div className="seite flex h-10 items-center justify-center gap-4 text-body-sm text-kohle">
          <p className="truncate">Versand mit DHL und DHL Express · sichere Zahlung über Stripe</p>
          <Link href="/versand" className="hidden shrink-0 font-medium text-tinte hover:underline sm:inline">
            Versandinfos →
          </Link>
        </div>
      </div>

      <div className="border-b border-haarlinie">
        <div className="seite flex h-16 items-center gap-4 sm:gap-8 lg:h-[72px]">
          <Wortmarke />

          <nav className="hidden flex-1 items-center gap-8 lg:flex" aria-label="Kategorien">
            <Link href="/shop" className="text-body-sm text-kohle hover:text-tinte">
              Alle Produkte
            </Link>
            {categories.slice(0, 4).map((category) => (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                className="text-body-sm text-kohle hover:text-tinte"
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <form action="/shop" className="hidden w-56 md:block" role="search">
              <input
                type="search"
                name="q"
                placeholder="Suchen …"
                aria-label="Produkte suchen"
                className="feld py-2 text-body-sm"
              />
            </form>
            <Link href="/konto" className="text-body-sm text-kohle hover:text-tinte">
              Konto
            </Link>
            <CartBadge />
          </div>
        </div>

        {/* Auf dem Handy: Kategorien als wischbare Zeile unter der Kopfzeile. */}
        <nav
          className="seite flex gap-6 overflow-x-auto pb-3 text-body-sm text-kohle lg:hidden"
          aria-label="Kategorien"
        >
          <Link href="/shop" className="shrink-0 hover:text-tinte">Alle Produkte</Link>
          {categories.map((category) => (
            <Link key={category.id} href={`/shop/${category.slug}`} className="shrink-0 hover:text-tinte">
              {category.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const categories = await navigationCategories();

  return (
    <footer className="mt-20 bg-leinen text-kohle">
      <div className="seite grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marke/winterfeld-logistik.svg" alt="Winterfeld Logistik" width={147} height={24} className="h-6 w-auto" />
          <p className="mt-4 max-w-xs text-body-sm">
            Produkte bestellen, sicher bezahlen und zuverlässig mit DHL geliefert bekommen.
          </p>
        </div>

        <FussSpalte titel="Sortiment">
          <li><Link href="/shop" className="hover:text-tinte">Alle Produkte</Link></li>
          {categories.slice(0, 6).map((category) => (
            <li key={category.id}>
              <Link href={`/shop/${category.slug}`} className="hover:text-tinte">{category.name}</Link>
            </li>
          ))}
        </FussSpalte>

        <FussSpalte titel="Service">
          <li><Link href="/versand" className="hover:text-tinte">Versandinformationen</Link></li>
          <li><Link href="/zahlung" className="hover:text-tinte">Zahlungsarten</Link></li>
          <li><Link href="/widerruf" className="hover:text-tinte">Widerrufsbelehrung</Link></li>
          <li><Link href="/konto/bestellungen" className="hover:text-tinte">Bestellungen &amp; Tracking</Link></li>
        </FussSpalte>

        <FussSpalte titel="Rechtliches">
          <li><Link href="/impressum" className="hover:text-tinte">Impressum</Link></li>
          <li><Link href="/datenschutz" className="hover:text-tinte">Datenschutz</Link></li>
          <li><Link href="/agb" className="hover:text-tinte">AGB</Link></li>
          <li><Link href="/cookies" className="hover:text-tinte">Cookie-Einstellungen</Link></li>
        </FussSpalte>
      </div>

      <div className="border-t border-nebel">
        <div className="seite flex flex-col gap-2 py-6 text-caption text-schiefer sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Winterfeld Logistik</p>
          <p>Versand mit DHL &amp; DHL Express · Zahlung über Stripe</p>
        </div>
      </div>
    </footer>
  );
}

function FussSpalte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="augenbraue">{titel}</p>
      <ul className="mt-4 space-y-2.5 text-body-sm">{children}</ul>
    </div>
  );
}
