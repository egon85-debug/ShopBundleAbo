import Link from "next/link";

import { formatCents } from "@/lib/money";
import type { ProductListItem } from "@/services/catalog";

/** Produktkachel: ruhig, informationsdicht, mit klarem Verfügbarkeitssignal. */
export function ProductCard({ product }: { product: ProductListItem }) {
  const hasDiscount =
    product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
  const savings = hasDiscount
    ? Math.round(((product.compareAtPriceCents! - product.priceCents) / product.compareAtPriceCents!) * 100)
    : 0;
  const inStock = product.available > 0 || product.allowBackorder;

  return (
    <article className="group card overflow-hidden transition-all duration-300 ease-precise hover:-translate-y-1 hover:shadow-lift">
      <Link href={`/produkt/${product.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-mist-100">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-precise group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-mist-100 to-mist-200">
              <span className="font-mono text-xs tracking-widest text-mist-500">KEIN BILD</span>
            </div>
          )}

          {hasDiscount && (
            <span className="absolute left-3 top-3 rounded-md bg-beacon-500 px-2.5 py-1 font-display text-xs font-bold text-carbon-950">
              −{savings} %
            </span>
          )}
          {!inStock && (
            <span className="absolute right-3 top-3 rounded-md bg-carbon-900/85 px-2.5 py-1 font-display text-xs font-bold text-white">
              Ausverkauft
            </span>
          )}
        </div>

        <div className="p-5">
          <p className="code-chip">{product.sku}</p>
          <h3 className="mt-2.5 font-display text-[17px] font-bold leading-snug text-carbon-900">
            {product.name}
          </h3>
          {product.shortDescription && (
            <p className="mt-1.5 line-clamp-2 text-sm text-mist-700">{product.shortDescription}</p>
          )}

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-display text-xl font-extrabold tabular text-carbon-900">
                {formatCents(product.priceCents)}
              </p>
              {hasDiscount && (
                <p className="text-sm text-mist-500 line-through tabular">
                  {formatCents(product.compareAtPriceCents!)}
                </p>
              )}
            </div>
            <span
              className={`font-mono text-xs ${inStock ? "text-emerald-600" : "text-mist-500"}`}
            >
              {product.available > 0
                ? `${product.available} auf Lager`
                : product.allowBackorder
                  ? "Nachbestellbar"
                  : "Nicht verfügbar"}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
