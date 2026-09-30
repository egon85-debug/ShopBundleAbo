import Link from "next/link";

import { CartBadge } from "@/components/ui/CartBadge";
import { KategorienMenue, type MenueKategorie } from "@/components/ui/KategorienMenue";
import { NeuheitenBand } from "@/components/ui/NeuheitenBand";
import type { CategoryNode } from "@/services/catalog";
import { navigationCategories, neuheiten } from "@/services/navigation";

/**
 * Kopf- und Fusszeile zeigen die Kategorien aus der Datenbank – zwischen-
 * gespeichert und mit Ersatzwert, damit eine kurzzeitig langsame oder nicht
 * erreichbare Datenbank keine Seite lahmlegt. Der Warenkorbzähler kommt aus
 * einem eigenen Aufruf im Browser (siehe CartBadge), weil er an einem Cookie
 * hängt und die Seiten sonst nicht mehr statisch ausgeliefert werden könnten.
 */

/** Das Logo in der Mitte der Kopfzeile – bewusst groß, es trägt die Marke. */
function Wortmarke() {
  return (
    <Link href="/" className="shrink-0" aria-label="Winterfeldt Logistik – Startseite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marke/winterfeld-logistik.svg"
        alt=""
        width={355}
        height={56}
        className="h-6 w-auto min-[380px]:h-7 sm:h-9 md:h-10 lg:h-14"
      />
    </Link>
  );
}

/** Nur was das Menü im Browser braucht (keine Datumsfelder, keine Beschreibungen). */
function fuersMenue(knoten: CategoryNode[]): MenueKategorie[] {
  return knoten.map((k) => ({ id: k.id, name: k.name, slug: k.slug, kinder: fuersMenue(k.children) }));
}

/**
 * Kopfbereich: Hinweisleiste und Laufband mit Neuheiten scrollen mit weg, nur
 * die eigentliche Kopfzeile (Wortmarke, Kategorien, Suche, Konto, Warenkorb)
 * bleibt oben kleben – sonst wäre der klebende Block am Handy fast 200 px hoch.
 */
export async function SiteHeader() {
  const [categories, neueArtikel] = await Promise.all([navigationCategories(), neuheiten()]);

  return (
    <>
      {/* Hinweisleiste */}
      <div className="bg-leinen">
        <div className="seite flex h-10 items-center justify-center gap-4 text-body-sm text-kohle">
          <p className="truncate">Versand mit DHL und DHL Express · sichere Zahlung über Stripe</p>
          <Link href="/versand" className="hidden shrink-0 font-medium text-tinte hover:underline sm:inline">
            Versandinfos →
          </Link>
        </div>
      </div>

      <NeuheitenBand artikel={neueArtikel} />

      {/* Links das Kategorien-Menü, in der Mitte das Logo, rechts Suche, Konto, Warenkorb.
          Drei Spalten 1fr · auto · 1fr halten das Logo genau mittig; was rechts nicht
          mehr passt (Suche unter 1280 px, Konto unter 768 px), steht im Menü. */}
      <header className="sticky top-0 z-50 border-b border-haarlinie bg-white">
        <div className="seite grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6 lg:h-24">
          <div className="justify-self-start">
            <KategorienMenue kategorien={fuersMenue(categories)} />
          </div>

          <Wortmarke />

          <div className="flex items-center justify-self-end gap-3">
            <form action="/shop" className="hidden w-36 xl:block" role="search">
              <input
                type="search"
                name="q"
                placeholder="Suchen …"
                aria-label="Produkte suchen"
                className="feld py-2 text-body-sm"
              />
            </form>
            <Link href="/konto" className="hidden text-body-sm text-kohle hover:text-tinte md:inline">
              Konto
            </Link>
            <CartBadge />
          </div>
        </div>
      </header>
    </>
  );
}

export async function SiteFooter() {
  const categories = await navigationCategories();

  return (
    <footer className="mt-20 bg-leinen text-kohle">
      <div className="seite grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marke/winterfeld-logistik.svg" alt="Winterfeldt Logistik" width={152} height={24} className="h-6 w-auto" />
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
          <p>© {new Date().getFullYear()} Winterfeldt Logistik</p>
          <div className="flex flex-wrap items-center gap-4">
            <p>Versand mit DHL &amp; DHL Express · Zahlung über Stripe</p>
            {/* Zugang zum Backoffice; ohne Anmeldung führt er auf die Anmeldeseite. */}
            <Link href="/admin" rel="nofollow" className="knopf-klein">Admin-Bereich</Link>
          </div>
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
