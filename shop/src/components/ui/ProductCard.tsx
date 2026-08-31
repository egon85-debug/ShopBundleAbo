import Link from "next/link";

import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Tilt } from "@/components/motion/Tilt";
import { formatCents } from "@/lib/money";
import type { ProductListItem } from "@/services/catalog";

/**
 * Produktkachel: ruhig, informationsdicht, mit klarem Verfuegbarkeitssignal.
 *
 * Die Karte bleibt serverseitig gerendert – nur die Neigung und die
 * hochzaehlenden Zahlen sind Client-Bausteine. Damit kostet die Aufwertung
 * kaum zusaetzliches JavaScript, und ohne JavaScript steht die Karte
 * vollstaendig da.
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const hasDiscount =
    product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
  const savings = hasDiscount
    ? Math.round(((product.compareAtPriceCents! - product.priceCents) / product.compareAtPriceCents!) * 100)
    : 0;
  const inStock = product.available > 0 || product.allowBackorder;

  return (
    <Tilt>
      <article className="group card relative overflow-hidden transition-shadow duration-300 ease-precise hover:shadow-lift">
        <Link href={`/produkt/${product.slug}`} className="block">
          <div className="relative aspect-[4/3] overflow-hidden bg-mist-100">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[600ms] ease-precise group-hover:scale-[1.045]"
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

          {/* Der Textblock liegt eine Spur vor dem Bild – das gibt der
              geneigten Karte spuerbare Tiefe statt nur einer Drehung. */}
          <div className="p-5" style={{ transform: "translateZ(26px)" }}>
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
                  <AnimatedNumber wert={product.priceCents} formatieren={(c) => formatCents(Math.round(c))} />
                </p>
                {hasDiscount && (
                  <p className="text-sm text-mist-500 line-through tabular">
                    {formatCents(product.compareAtPriceCents!)}
                  </p>
                )}
              </div>
              <span className={`font-mono text-xs ${inStock ? "text-emerald-600" : "text-mist-500"}`}>
                {product.available > 0 ? (
                  <>
                    <AnimatedNumber
                      wert={product.available}
                      formatieren={(wert) => String(Math.round(wert))}
                      dauer={0.75}
                    />{" "}
                    auf Lager
                  </>
                ) : product.allowBackorder ? (
                  "Nachbestellbar"
                ) : (
                  "Nicht verfügbar"
                )}
              </span>
            </div>
          </div>
        </Link>
        <span className="schein" aria-hidden />
      </article>
    </Tilt>
  );
}
