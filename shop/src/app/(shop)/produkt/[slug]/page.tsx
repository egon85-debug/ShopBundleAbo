import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/ui/AddToCartForm";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { Ueberschrift, Verfuegbarkeit } from "@/components/ui/Gestaltung";
import { ProductCard } from "@/components/ui/ProductCard";
import { beschreibungHtml } from "@/lib/beschreibung";
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
  const beschreibung = beschreibungHtml(product.description);

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
    <div className="seite py-12 lg:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Brotkrumen" className="mb-8 flex flex-wrap items-center gap-2 text-body-sm text-schiefer">
        <Link href="/" className="hover:text-tinte">Start</Link>
        <span aria-hidden>/</span>
        <Link href="/shop" className="hover:text-tinte">Shop</Link>
        {product.categories[0] && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/shop/${product.categories[0].slug}`} className="hover:text-tinte">
              {product.categories[0].name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          images={product.images.map((image) => ({ url: image.url, alt: image.alt ?? product.name }))}
          videoUrl={product.videoUrl}
          model3dUrl={product.model3dUrl}
          productName={product.name}
        />

        <div>
          <p className="nummer">Artikelnummer {product.sku}</p>
          <h1 className="mt-3 text-heading font-light text-balance lg:text-heading-lg">{product.name}</h1>
          <span aria-hidden className="akzentlinie mt-5" />
          {product.shortDescription && (
            <p className="mt-6 text-subheading text-kohle">{product.shortDescription}</p>
          )}

          <div className="mt-8 flex flex-wrap items-baseline gap-4">
            <span className="text-heading tabular">{formatCents(product.priceCents)}</span>
            {hasDiscount && (
              <span className="text-subheading tabular text-schiefer line-through">
                {formatCents(product.compareAtPriceCents!)}
              </span>
            )}
          </div>
          <p className="mt-1 text-body-sm text-schiefer">
            inkl. {product.taxRate} % MwSt. ({formatCents(taxCents)}) · zzgl.{" "}
            <Link href="/versand" className="underline hover:text-tinte">Versand</Link> ab{" "}
            {formatCents(shipping.priceCents)}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Verfuegbarkeit
              verfuegbar={product.available}
              nachbestellbar={product.allowBackorder}
              ausfuehrlich
            />
            {product.deliveryTime && (
              <span className="text-body-sm text-kohle">Lieferzeit: {product.deliveryTime}</span>
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
          />

          {product.description && (
            <section className="mt-12 border-t border-haarlinie pt-8">
              <h2 className="text-heading-sm font-medium">Beschreibung</h2>
              {beschreibung ? (
                // Bereinigt in beschreibungHtml: nur <p>, <ul>, <li>, <strong> … ohne Attribute.
                <div className="beschreibung mt-4 text-body text-kohle" dangerouslySetInnerHTML={{ __html: beschreibung }} />
              ) : (
                <div className="mt-4 whitespace-pre-line text-body text-kohle">{product.description}</div>
              )}
            </section>
          )}

          {Object.keys(product.technicalData).length > 0 && (
            <section className="mt-10 border-t border-haarlinie pt-8">
              <h2 className="text-heading-sm font-medium">Technische Daten</h2>
              <dl className="mt-4 divide-y divide-haarlinie">
                {Object.entries(product.technicalData).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-6 py-3 text-body">
                    <dt className="text-kohle">{key}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {product.downloads.length > 0 && (
            <section className="mt-10 border-t border-haarlinie pt-8">
              <h2 className="text-heading-sm font-medium">Downloads</h2>
              <ul className="mt-4 space-y-2">
                {product.downloads.map((download) => (
                  <li key={download.url}>
                    <a href={download.url} className="textlink" target="_blank" rel="noopener noreferrer">
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
        <section className="mt-28">
          <Ueberschrift groesse="gross">Ähnliche Produkte</Ueberschrift>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
