import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/ui/AddToCartForm";
import { ProduktAnsicht } from "@/components/shop/ProduktAnsicht";
import { ProductCard } from "@/components/ui/ProductCard";
import { formatCents, taxFromGross } from "@/lib/money";
import { getShippingProvider } from "@/lib/shipping/registry";
import { getProductBySlug } from "@/services/catalog";

export const revalidate = 60;

/**
 * Bewusst kein generateStaticParams: Produktseiten entstehen beim ersten
 * Aufruf und liegen danach im Zwischenspeicher (ISR). Ein Vorrendern beim
 * Deployment wuerde den Build von der Erreichbarkeit der Datenbank abhaengig
 * machen – eine Datenbankstoerung darf keine Auslieferung verhindern.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Produkt nicht gefunden" };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
    openGraph: {
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? product.shortDescription ?? undefined,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || !product.isActive) notFound();

  const inStock = product.available > 0 || product.allowBackorder;
  const hasDiscount = product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
  const taxCents = taxFromGross(product.priceCents, product.taxRate);
  const shipping = getShippingProvider("dhl_paket");

  // Strukturierte Daten für Suchmaschinen.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.shortDescription ?? undefined,
    image: product.images.map((image) => image.url),
    brand: { "@type": "Brand", name: "Winterfeld Logistik" },
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="section py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Brotkrumen" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-mist-700">
        <Link href="/" className="hover:text-carbon-900">Start</Link>
        <span aria-hidden>/</span>
        <Link href="/shop" className="hover:text-carbon-900">Shop</Link>
        {product.categories[0] && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/shop/${product.categories[0].slug}`} className="hover:text-carbon-900">
              {product.categories[0].name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ProduktAnsicht
          images={product.images.map((image) => ({ url: image.url, alt: image.alt ?? product.name }))}
          videoUrl={product.videoUrl}
          model3dUrl={product.model3dUrl}
          productName={product.name}
          // Nur Produkte mit vollstaendigen Massen bekommen die raeumliche
          // Ansicht – dann steht dort der richtige Koerper, kein Platzhalter.
          masse={
            product.lengthMm && product.widthMm && product.heightMm
              ? { laenge: product.lengthMm, breite: product.widthMm, hoehe: product.heightMm }
              : null
          }
        />

        <div>
          <p className="code-chip">SKU {product.sku}</p>
          <h1 className="mt-3 font-display text-display-lg font-extrabold text-balance">{product.name}</h1>
          {product.shortDescription && (
            <p className="mt-4 text-lg leading-relaxed text-mist-700">{product.shortDescription}</p>
          )}

          <div className="mt-7 flex flex-wrap items-end gap-4">
            <span className="font-display text-4xl font-extrabold tabular">{formatCents(product.priceCents)}</span>
            {hasDiscount && (
              <span className="pb-1 text-xl text-mist-500 line-through tabular">
                {formatCents(product.compareAtPriceCents!)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-mist-700">
            inkl. {product.taxRate} % MwSt. ({formatCents(taxCents)}) · zzgl.{" "}
            <Link href="/versand" className="underline hover:text-carbon-900">Versand</Link> ab{" "}
            {formatCents(shipping.priceCents)}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-display text-sm font-bold ${
                inStock ? "bg-emerald-50 text-emerald-700" : "bg-mist-100 text-mist-700"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${inStock ? "bg-emerald-500" : "bg-mist-500"}`} />
              {product.available > 0
                ? `${product.available} sofort verfügbar`
                : product.allowBackorder
                  ? "Nachbestellbar"
                  : "Derzeit nicht verfügbar"}
            </span>
            {product.deliveryTime && (
              <span className="font-mono text-sm text-mist-700">Lieferzeit: {product.deliveryTime}</span>
            )}
          </div>

          <AddToCartForm
            productId={product.id}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              priceCents: variant.priceCents,
            }))}
            disabled={!inStock}
            maxQuantity={product.allowBackorder ? 99 : Math.max(product.available, 1)}
            bildUrl={product.images[0]?.url ?? null}
          />

          {product.description && (
            <section className="mt-10 border-t border-mist-200 pt-8">
              <h2 className="font-display text-xl font-bold">Beschreibung</h2>
              <div className="prose-sm mt-3 whitespace-pre-line text-[15px] leading-relaxed text-mist-700">
                {product.description}
              </div>
            </section>
          )}

          {Object.keys(product.technicalData).length > 0 && (
            <section className="mt-8 border-t border-mist-200 pt-8">
              <h2 className="font-display text-xl font-bold">Technische Daten</h2>
              <dl className="mt-3 divide-y divide-mist-200">
                {Object.entries(product.technicalData).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-6 py-2.5 text-[15px]">
                    <dt className="text-mist-700">{key}</dt>
                    <dd className="text-right font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {product.downloads.length > 0 && (
            <section className="mt-8 border-t border-mist-200 pt-8">
              <h2 className="font-display text-xl font-bold">Downloads</h2>
              <ul className="mt-3 space-y-2">
                {product.downloads.map((download) => (
                  <li key={download.url}>
                    <a href={download.url} className="text-[15px] font-semibold text-signal-600 hover:underline" target="_blank" rel="noopener noreferrer">
                      {download.label} ↓
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {product.relatedProducts.length > 0 && (
        <section className="mt-20">
          <p className="eyebrow">Passend dazu</p>
          <h2 className="mt-3 font-display text-display-md font-extrabold">Ähnliche Produkte</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {product.relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
