import Link from "next/link";

import { ProduktBild, Verfuegbarkeit } from "@/components/ui/Gestaltung";
import { formatCents } from "@/lib/money";
import type { ProductListItem } from "@/services/catalog";

/**
 * Produktkachel: flach, Haarlinie, 5 px Radius, kein Schatten.
 * Die ganze Karte ist ein Link; Kaufen passiert auf der Produktseite – so
 * bleibt das Raster frei von orangen Knöpfen (Orange ist Satzzeichen).
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const hasDiscount =
    product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
  const savings = hasDiscount
    ? Math.round(((product.compareAtPriceCents! - product.priceCents) / product.compareAtPriceCents!) * 100)
    : 0;

  return (
    <article data-produktkarte className="karte group h-full p-4 transition-colors duration-200 hover:border-nebel">
      <Link href={`/produkt/${product.slug}`} className="flex h-full flex-col">
        <div className="relative">
          <ProduktBild url={product.imageUrl} alt={product.name} className="aspect-[4/3]" />
          {hasDiscount && <span className="plakette-hervor absolute left-3 top-3">−{savings} %</span>}
        </div>

        <p className="nummer mt-4">{product.sku}</p>
        <h3 className="mt-1 text-subheading font-medium text-tinte group-hover:underline group-hover:underline-offset-4">
          {product.name}
        </h3>
        {product.shortDescription && (
          <p className="mt-1 line-clamp-2 text-body-sm text-kohle">{product.shortDescription}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-heading-sm tabular text-tinte">{formatCents(product.priceCents)}</p>
            {hasDiscount && (
              <p className="text-body-sm tabular text-schiefer line-through">
                {formatCents(product.compareAtPriceCents!)}
              </p>
            )}
          </div>
          <Verfuegbarkeit verfuegbar={product.available} nachbestellbar={product.allowBackorder} />
        </div>
      </Link>
    </article>
  );
}
