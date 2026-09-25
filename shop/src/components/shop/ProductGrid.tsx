import Link from "next/link";

import { Ueberschrift } from "@/components/ui/Gestaltung";
import { ProductCard } from "@/components/ui/ProductCard";
import { formatCents } from "@/lib/money";
import {
  getCategoryBySlug,
  getCategoryTree,
  getPriceRange,
  listProducts,
  type ProductQuery,
} from "@/services/catalog";

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "price_asc", label: "Preis aufsteigend" },
  { value: "price_desc", label: "Preis absteigend" },
  { value: "name_asc", label: "Name A–Z" },
] as const;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Produktübersicht mit Suche, Kategorie-, Preis- und Verfügbarkeitsfilter.
 * Alle Filter laufen über die URL – teilbar, zurück-navigierbar, SEO-freundlich.
 */
export async function ProductGrid({
  params,
  categorySlug,
}: {
  params: Record<string, string | string[] | undefined>;
  categorySlug?: string;
}) {
  const search = single(params.q);
  const sort = (single(params.sort) ?? "newest") as NonNullable<ProductQuery["sort"]>;
  const page = Math.max(1, Number(single(params.page) ?? 1) || 1);
  const inStockOnly = single(params.lager) === "1";
  const minPrice = single(params.min);
  const maxPrice = single(params.max);

  const [{ minCents, maxCents }, categories, category] = await Promise.all([
    getPriceRange(),
    getCategoryTree(),
    categorySlug ? getCategoryBySlug(categorySlug) : Promise.resolve(null),
  ]);

  const { items, total } = await listProducts({
    categorySlug,
    search,
    sort,
    inStockOnly,
    minPriceCents: minPrice ? Number(minPrice) * 100 : undefined,
    maxPriceCents: maxPrice ? Number(maxPrice) * 100 : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const basePath = categorySlug ? `/shop/${categorySlug}` : "/shop";

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const current = { q: search, sort, lager: inStockOnly ? "1" : undefined, min: minPrice, max: maxPrice, page: String(page), ...overrides };
    Object.entries(current).forEach(([key, value]) => {
      if (value && value !== "1" + "undefined") next.set(key, value);
    });
    if (next.get("page") === "1") next.delete("page");
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="seite py-12 lg:py-16">
      <nav aria-label="Brotkrumen" className="mb-8 flex flex-wrap items-center gap-2 text-body-sm text-schiefer">
        <Link href="/" className="hover:text-tinte">Start</Link>
        <span aria-hidden>/</span>
        <Link href="/shop" className="hover:text-tinte">Shop</Link>
        {category && (
          <>
            <span aria-hidden>/</span>
            <span className="text-tinte">{category.name}</span>
          </>
        )}
      </nav>

      <header className="mb-12">
        <Ueberschrift als="h1" groesse="gross" augenbraue={`${total} Artikel`}>
          {category?.name ?? (search ? `Suche: „${search}“` : "Alle Produkte")}
        </Ueberschrift>
        {category?.description && (
          <p className="mt-6 max-w-2xl text-subheading text-kohle">{category.description}</p>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* ── Filterspalte ─────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <form action={basePath} method="get" className="karte space-y-6 p-5">
            <div>
              <label htmlFor="filter-q" className="feldname">Suche</label>
              <input id="filter-q" type="search" name="q" defaultValue={search} placeholder="Name, Artikelnummer …" className="feld" />
            </div>

            <div>
              <span className="feldname">Preis (€)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" name="min" min={0} placeholder={String(Math.floor(minCents / 100))}
                  defaultValue={minPrice} aria-label="Mindestpreis" className="feld tabular"
                />
                <span className="text-asche">–</span>
                <input
                  type="number" name="max" min={0} placeholder={String(Math.ceil(maxCents / 100))}
                  defaultValue={maxPrice} aria-label="Höchstpreis" className="feld tabular"
                />
              </div>
              <p className="mt-2 text-caption text-schiefer">
                Sortiment: {formatCents(minCents)} – {formatCents(maxCents)}
              </p>
            </div>

            <div>
              <label htmlFor="filter-sort" className="feldname">Sortierung</label>
              <select id="filter-sort" name="sort" defaultValue={sort} className="feld">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" name="lager" value="1" defaultChecked={inStockOnly} className="auswahl" />
              <span className="text-body-sm text-kohle">Nur verfügbare Artikel</span>
            </label>

            <div className="flex items-center gap-4">
              <button type="submit" className="knopf-geist flex-1">Filtern</button>
              <Link href={basePath} className="textlink text-body-sm">Zurücksetzen</Link>
            </div>
          </form>

          <nav aria-label="Kategorien" className="karte p-5">
            <p className="augenbraue mb-3">Kategorien</p>
            <ul className="space-y-0.5 text-body-sm">
              <li>
                <Link
                  href="/shop"
                  aria-current={!categorySlug ? "page" : undefined}
                  className={`block rounded-klein px-3 py-2 hover:bg-leinen ${!categorySlug ? "bg-leinen font-medium text-tinte" : "text-kohle"}`}
                >
                  Alle Produkte
                </Link>
              </li>
              {categories.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/shop/${item.slug}`}
                    aria-current={categorySlug === item.slug ? "page" : undefined}
                    className={`block rounded-klein px-3 py-2 hover:bg-leinen ${categorySlug === item.slug ? "bg-leinen font-medium text-tinte" : "text-kohle"}`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <ul className="ml-3 border-l border-haarlinie pl-2">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/shop/${child.slug}`}
                            aria-current={categorySlug === child.slug ? "page" : undefined}
                            className={`block rounded-klein px-3 py-1.5 hover:bg-leinen ${categorySlug === child.slug ? "font-medium text-tinte" : "text-schiefer"}`}
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* ── Ergebnisse ───────────────────────────────────────────────── */}
        <div>
          {items.length === 0 ? (
            <div className="karte p-12 text-center">
              <p className="text-heading-sm font-light">Keine Produkte gefunden</p>
              <p className="mt-3 text-kohle">
                Passen Sie die Filter an oder{" "}
                <Link href={basePath} className="textlink underline">
                  setzen Sie sie zurück
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {pageCount > 1 && (
                <nav aria-label="Seiten" className="mt-12 flex items-center justify-center gap-2">
                  {Array.from({ length: pageCount }).map((_, index) => {
                    const target = index + 1;
                    const aktiv = target === page;
                    return (
                      <Link
                        key={target}
                        href={buildHref({ page: String(target) })}
                        aria-current={aktiv ? "page" : undefined}
                        className={aktiv ? "plakette-aktiv px-4 py-2 text-body-sm tabular" : "knopf-klein px-4 tabular"}
                      >
                        {target}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
