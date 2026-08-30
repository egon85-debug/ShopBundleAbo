import Link from "next/link";

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
    <div className="section py-12">
      <nav aria-label="Brotkrumen" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-mist-700">
        <Link href="/" className="hover:text-carbon-900">Start</Link>
        <span aria-hidden>/</span>
        <Link href="/shop" className="hover:text-carbon-900">Shop</Link>
        {category && (
          <>
            <span aria-hidden>/</span>
            <span className="font-semibold text-carbon-900">{category.name}</span>
          </>
        )}
      </nav>

      <header className="mb-10">
        <p className="eyebrow">{total} Artikel</p>
        <h1 className="mt-3 font-display text-display-lg font-extrabold">
          {category?.name ?? (search ? `Suche: „${search}“` : "Alle Produkte")}
        </h1>
        {category?.description && (
          <p className="mt-3 max-w-2xl text-lg text-mist-700">{category.description}</p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* ── Filterspalte ─────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <form action={basePath} method="get" className="card space-y-6 p-5">
            <div>
              <label htmlFor="filter-q" className="label">Suche</label>
              <input id="filter-q" type="search" name="q" defaultValue={search} placeholder="Produktname, SKU …" className="field" />
            </div>

            <div>
              <span className="label">Preis (€)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" name="min" min={0} placeholder={String(Math.floor(minCents / 100))}
                  defaultValue={minPrice} aria-label="Mindestpreis" className="field tabular"
                />
                <span className="text-mist-500">–</span>
                <input
                  type="number" name="max" min={0} placeholder={String(Math.ceil(maxCents / 100))}
                  defaultValue={maxPrice} aria-label="Höchstpreis" className="field tabular"
                />
              </div>
              <p className="mt-1.5 font-mono text-xs text-mist-500">
                Sortiment: {formatCents(minCents)} – {formatCents(maxCents)}
              </p>
            </div>

            <div>
              <label htmlFor="filter-sort" className="label">Sortierung</label>
              <select id="filter-sort" name="sort" defaultValue={sort} className="field">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" name="lager" value="1" defaultChecked={inStockOnly} className="h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500" />
              <span className="text-[15px] font-semibold">Nur verfügbare Artikel</span>
            </label>

            <div className="flex gap-2">
              <button type="submit" className="btn-dark flex-1 py-2.5">Filtern</button>
              <Link href={basePath} className="btn-ghost py-2.5">Zurücksetzen</Link>
            </div>
          </form>

          <nav aria-label="Kategorien" className="card mt-5 p-5">
            <p className="label">Kategorien</p>
            <ul className="space-y-1">
              <li>
                <Link href="/shop" className={`block rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100 ${!categorySlug ? "bg-mist-100 text-signal-600" : ""}`}>
                  Alle Produkte
                </Link>
              </li>
              {categories.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/shop/${item.slug}`}
                    className={`block rounded-lg px-3 py-2 text-[15px] font-semibold hover:bg-mist-100 ${categorySlug === item.slug ? "bg-mist-100 text-signal-600" : ""}`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <ul className="ml-3 border-l border-mist-200 pl-2">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/shop/${child.slug}`}
                            className={`block rounded-lg px-3 py-1.5 text-sm hover:bg-mist-100 ${categorySlug === child.slug ? "text-signal-600" : "text-mist-700"}`}
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
            <div className="card p-12 text-center">
              <p className="font-display text-xl font-bold">Keine Produkte gefunden</p>
              <p className="mt-2 text-mist-700">
                Passen Sie die Filter an oder{" "}
                <Link href={basePath} className="font-semibold text-signal-600 underline">
                  setzen Sie sie zurück
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {pageCount > 1 && (
                <nav aria-label="Seiten" className="mt-10 flex items-center justify-center gap-2">
                  {Array.from({ length: pageCount }).map((_, index) => {
                    const target = index + 1;
                    return (
                      <Link
                        key={target}
                        href={buildHref({ page: String(target) })}
                        aria-current={target === page ? "page" : undefined}
                        className={`rounded-lg border px-4 py-2 font-mono text-sm tabular transition-colors ${
                          target === page
                            ? "border-carbon-900 bg-carbon-900 text-white"
                            : "border-mist-300 bg-white hover:border-carbon-900"
                        }`}
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
