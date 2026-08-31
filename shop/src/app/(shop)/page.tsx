import Link from "next/link";

import { KategorieHintergrund } from "@/components/three/KategorieHintergrund";
import { LazyCartonReveal, LazyHeroScene, LazyPackageJourney } from "@/components/three/LazyScenes";
import { HeroTitel } from "@/components/ui/HeroTitel";
import { ProductCard } from "@/components/ui/ProductCard";
import { NewsletterForm } from "@/components/ui/NewsletterForm";
import { listProducts } from "@/services/catalog";
import { navigationCategories } from "@/services/navigation";
import { shippingOptions } from "@/lib/shipping/registry";
import { formatCents } from "@/lib/money";


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
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-carbon-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid-fine bg-grid-fine opacity-50" />
        <div className="absolute inset-0">
          <LazyHeroScene />
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-carbon-950 via-carbon-950/85 to-transparent"
          aria-hidden
        />

        <HeroTitel />
      </section>

      {/* ── Der Karton öffnet sich ─────────────────────────────────────
          Führt vom Einstieg in den Shop: derselbe Karton, jetzt geöffnet,
          und das Sortiment schwebt heraus – direkt in die Kategorien. */}
      <LazyCartonReveal />

      {/* ── Kategorien ─────────────────────────────────────────────────── */}
      <section id="kategorien" className="section scroll-mt-24 py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Sortiment</p>
            <h2 className="mt-3 font-display text-display-md font-extrabold">Kategorien</h2>
          </div>
          <Link href="/shop" className="hidden shrink-0 text-[15px] font-semibold text-signal-600 hover:underline sm:block">
            Alle Produkte →
          </Link>
        </div>

        {categories.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-mist-300 p-10 text-center text-mist-700">
            Noch keine Kategorien angelegt. Im Adminbereich unter{" "}
            <Link href="/admin/kategorien" className="font-semibold text-signal-600 underline">
              Kategorien
            </Link>{" "}
            lassen sie sich ohne Programmierung erstellen.
          </p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                data-kategorie-kachel
                className="gruppe group relative flex min-h-[190px] flex-col justify-end overflow-hidden rounded-2xl border border-mist-200 bg-carbon-900 p-6 text-white transition-all duration-300 ease-precise hover:-translate-y-1 hover:shadow-lift"
              >
                {/* Raeumliche Ebene – liegt hinter allem, faengt keine Klicks ab. */}
                <KategorieHintergrund name={category.name} />
                {category.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={category.imageUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-45 transition-transform duration-500 ease-precise group-hover:scale-105"
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/45 to-transparent" />
                <span className="relative font-mono text-xs text-signal-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="relative mt-1 font-display text-xl font-bold">{category.name}</h3>
                {category.children.length > 0 && (
                  <p className="relative mt-1 text-sm text-mist-300">
                    {category.children.map((child) => child.name).join(" · ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Bestseller ─────────────────────────────────────────────────── */}
      {bestsellers.items.length > 0 && (
        <ProductRow title="Bestseller" eyebrow="Beliebt" items={bestsellers.items} href="/shop?sort=newest" />
      )}

      {/* ── Package Journey (3D) ───────────────────────────────────────── */}
      <LazyPackageJourney />

      {/* ── Neu & Angebote ─────────────────────────────────────────────── */}
      {newest.items.length > 0 && (
        <ProductRow title="Neu im Shop" eyebrow="Frisch eingetroffen" items={newest.items} href="/shop?sort=newest" />
      )}
      {discounted.length > 0 && (
        <ProductRow title="Angebote" eyebrow="Reduziert" items={discounted.slice(0, 4)} href="/shop" />
      )}

      {/* ── Vorteile ───────────────────────────────────────────────────── */}
      <section className="section py-20">
        <p className="eyebrow">Warum Winterfeld Logistik</p>
        <h2 className="mt-3 font-display text-display-md font-extrabold">Verlässlich in jedem Schritt</h2>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Schneller Versand",
              text: "Bezahlte Bestellungen gehen werktags in die Kommissionierung – Etikett und Tracking entstehen automatisch.",
            },
            {
              title: "Sichere Zahlung",
              text: "Stripe verarbeitet alle Zahlungen. Kartendaten berühren unsere Server nie.",
            },
            {
              title: shipping.map((option) => option.label).join(" & "),
              text: shipping
                .map((option) => `${option.label}: ${option.deliveryEstimate} · ${formatCents(option.priceCents)}`)
                .join(" — "),
            },
            {
              title: "Professionelle Abwicklung",
              text: "Jede Statusänderung ist protokolliert, jede Sendung nachverfolgbar, jede Erstattung dokumentiert.",
            },
          ].map((benefit, index) => (
            <div key={benefit.title} className="card p-6">
              <span className="font-mono text-xs text-signal-600">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-display text-lg font-bold">{benefit.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mist-700">{benefit.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────────────── */}
      <section className="section pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-carbon-950 px-6 py-14 text-white sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-grid-fine bg-grid-fine opacity-40" />
          <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow text-signal-300">Newsletter</p>
              <h2 className="mt-3 font-display text-display-md font-extrabold">
                Neue Produkte zuerst erfahren
              </h2>
              <p className="mt-3 max-w-md text-mist-300">
                Gelegentliche Nachrichten zu neuen Artikeln und Angeboten. Abmeldung jederzeit über den
                Link in jeder E-Mail.
              </p>
            </div>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </>
  );
}

function ProductRow({
  title,
  eyebrow,
  items,
  href,
}: {
  title: string;
  eyebrow: string;
  items: Awaited<ReturnType<typeof listProducts>>["items"];
  href: string;
}) {
  return (
    <section className="section py-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-3 font-display text-display-md font-extrabold">{title}</h2>
        </div>
        <Link href={href} className="hidden shrink-0 text-[15px] font-semibold text-signal-600 hover:underline sm:block">
          Mehr ansehen →
        </Link>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
