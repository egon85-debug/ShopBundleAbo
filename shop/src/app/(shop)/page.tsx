import Link from "next/link";

import { EinstiegsVideo } from "@/components/ui/EinstiegsVideo";
import { Ueberschrift } from "@/components/ui/Gestaltung";
import { NewsletterForm } from "@/components/ui/NewsletterForm";
import { ProductCard } from "@/components/ui/ProductCard";
import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";
import { listProducts } from "@/services/catalog";
import { navigationCategories } from "@/services/navigation";

export const revalidate = 60;

const EMPTY_LIST = { items: [], total: 0 };

/**
 * Die Startseite wird alle 60 Sekunden neu erzeugt. Ist die Datenbank in diesem
 * Moment nicht erreichbar (etwa beim allerersten Deployment, bevor Migrationen
 * gelaufen sind), rendert die Seite ihre statischen Abschnitte trotzdem und
 * füllt die Produktbereiche beim nächsten Durchlauf auf.
 */
async function safely<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

const SCHRITTE = [
  { titel: "Bestellen", text: "Artikel auswählen und bestellen – auch ohne Kundenkonto." },
  { titel: "Sicher bezahlen", text: "Stripe verarbeitet die Zahlung. Kartendaten berühren unsere Server nie." },
  { titel: "Versand mit DHL", text: "Etikett und Sendungsnummer entstehen automatisch nach der Zahlung." },
  { titel: "Sendung verfolgen", text: "Jeder Statuswechsel steht auf Ihrer Bestellseite." },
];

export default async function HomePage() {
  const [categories, bestsellers, newest, offers] = await Promise.all([
    navigationCategories(),
    safely(() => listProducts({ featuredOnly: true, limit: 4 }), EMPTY_LIST),
    safely(() => listProducts({ sort: "newest", limit: 4 }), EMPTY_LIST),
    safely(() => listProducts({ sort: "price_asc", limit: 8 }), EMPTY_LIST),
  ]);

  const discounted = offers.items.filter(
    (item) => item.compareAtPriceCents && item.compareAtPriceCents > item.priceCents,
  );
  const shipping = shippingOptions();

  return (
    <>
      {/* ── Einstieg ───────────────────────────────────────────────────── */}
      {/* Text links, rechts das Karton-Video (einmal abspielen, dann stehen lassen). */}
      <section className="seite grid items-center gap-12 pt-16 lg:grid-cols-2 lg:gap-16 lg:pt-24">
        <div>
          <Ueberschrift als="h1" groesse="display" augenbraue="Direkt aus unserem Lager">
            Logistik. Einfach. Digital.
          </Ueberschrift>
          <p className="mt-8 max-w-md text-subheading text-kohle">
            Produkte bestellen, sicher bezahlen und zuverlässig mit DHL geliefert bekommen.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/shop" className="knopf-aktion">
              Zum Shop <span aria-hidden>→</span>
            </Link>
            <Link href="#kategorien" className="knopf-zweit">
              Kategorien ansehen
            </Link>
          </div>
        </div>

        <div className="aspect-square overflow-hidden rounded-bild bg-leinen">
          <EinstiegsVideo
            video="/einstieg/karton"
            anfangsbild="/einstieg/karton-anfang.webp"
            endbild="/einstieg/karton-ende.webp"
          />
        </div>
      </section>

      {/* ── Kategorien ─────────────────────────────────────────────────── */}
      <section id="kategorien" className="seite scroll-mt-32 pt-20">
        <AbschnittKopf titel="Kategorien" link={{ href: "/shop", text: "Alle Produkte →" }} />

        {categories.length === 0 ? (
          <p className="karte mt-10 p-10 text-center text-kohle">
            Noch keine Kategorien angelegt. Im Adminbereich unter{" "}
            <Link href="/admin/kategorien" className="textlink">Kategorien</Link>{" "}
            lassen sie sich ohne Programmierung erstellen.
          </p>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                className="karte group flex min-h-[160px] flex-col justify-between p-6 transition-colors duration-200 hover:bg-leinen"
              >
                <div>
                  <h3 className="text-heading-sm font-medium">{category.name}</h3>
                  {category.children.length > 0 && (
                    <p className="mt-2 text-body-sm text-kohle">
                      {category.children.map((child) => child.name).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="mt-6 text-body-sm font-medium text-tinte">
                  Ansehen <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {bestsellers.items.length > 0 && (
        <ProductRow title="Bestseller" items={bestsellers.items} href="/shop?sort=newest" />
      )}
      {newest.items.length > 0 && (
        <ProductRow title="Neu im Shop" items={newest.items} href="/shop?sort=newest" />
      )}
      {discounted.length > 0 && (
        <ProductRow title="Angebote" items={discounted.slice(0, 4)} href="/shop" />
      )}

      {/* ── So läuft eine Bestellung ───────────────────────────────────── */}
      <section className="seite grid gap-12 pt-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <Ueberschrift groesse="gross">So läuft eine Bestellung</Ueberschrift>
          <ol className="mt-10 space-y-8">
            {SCHRITTE.map((schritt, index) => (
              <li key={schritt.titel}>
                <span className={index === 0 ? "plakette-aktiv" : "plakette px-0 text-asche"}>
                  Schritt {index + 1}
                </span>
                <p
                  className={`mt-2 border-b pb-3 text-subheading ${
                    index === 0 ? "border-b-2 border-haarlinie font-medium text-tinte" : "border-haarlinie text-kohle"
                  }`}
                >
                  {schritt.titel}
                </p>
                <p className="mt-3 text-body-sm text-kohle">{schritt.text}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="karte-hervor self-start p-8">
          <p className="augenbraue text-kohle">Versandarten</p>
          <ul className="mt-5 divide-y divide-nebel">
            {shipping.map((option) => (
              <li key={option.code} className="flex items-baseline justify-between gap-4 py-4">
                <span>
                  <span className="block text-subheading font-medium">{option.label}</span>
                  <span className="text-body-sm text-kohle">Lieferzeit {option.deliveryEstimate}</span>
                </span>
                <span className="text-heading-sm tabular">{formatCents(option.priceCents)}</span>
              </li>
            ))}
          </ul>
          <Link href="/versand" className="textlink mt-6 inline-block text-body-sm">
            Alles zum Versand →
          </Link>
        </div>
      </section>

      {/* ── Dunkles Band ───────────────────────────────────────────────── */}
      <section className="mt-20 bg-anthrazit py-20">
        <div className="seite">
          <Ueberschrift groesse="gross" mitte hell>
            Direkt aus unserem Lager – verpackt, versendet, nachverfolgbar.
          </Ueberschrift>
          <p className="mx-auto mt-6 max-w-xl text-center text-body text-asche">
            Jeder Artikel liegt bei uns im Regal. Was als verfügbar angezeigt wird, ist wirklich da.
          </p>
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────────────── */}
      <section className="seite py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
          <div>
            <Ueberschrift groesse="mittel">Neue Produkte zuerst erfahren</Ueberschrift>
            <p className="mt-6 max-w-md text-body text-kohle">
              Gelegentliche Nachrichten zu neuen Artikeln und Angeboten. Abmeldung jederzeit über den
              Link in jeder E-Mail.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

function AbschnittKopf({ titel, link }: { titel: string; link: { href: string; text: string } }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <Ueberschrift groesse="gross">{titel}</Ueberschrift>
      <Link href={link.href} className="textlink hidden shrink-0 text-body-sm sm:block">
        {link.text}
      </Link>
    </div>
  );
}

function ProductRow({
  title,
  items,
  href,
}: {
  title: string;
  items: Awaited<ReturnType<typeof listProducts>>["items"];
  href: string;
}) {
  return (
    <section className="seite pt-20">
      <AbschnittKopf titel={title} link={{ href, text: "Mehr ansehen →" }} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
