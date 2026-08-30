import type { Metadata } from "next";
import Link from "next/link";

import { removeCartItemAction, updateCartItemAction } from "@/app/actions/shop";
import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";
import { getCart } from "@/services/cart";

export const metadata: Metadata = { title: "Warenkorb", robots: { index: false } };

export default async function CartPage() {
  const cart = await getCart();
  const cheapestShipping = Math.min(...shippingOptions().map((option) => option.priceCents));

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="section py-20">
        <div className="card mx-auto max-w-lg p-12 text-center">
          <h1 className="font-display text-display-md font-extrabold">Ihr Warenkorb ist leer</h1>
          <p className="mt-3 text-mist-700">Stöbern Sie im Sortiment und legen Sie Artikel in den Warenkorb.</p>
          <Link href="/shop" className="btn-primary mt-8">Shop entdecken</Link>
        </div>
      </div>
    );
  }

  const total = cart.subtotalCents + cheapestShipping;

  return (
    <div className="section py-12">
      <h1 className="font-display text-display-lg font-extrabold">Warenkorb</h1>
      <p className="mt-2 text-mist-700">{cart.itemCount} Artikel</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {cart.lines.map((line) => {
            const overbooked = !line.allowBackorder && line.quantity > line.available;
            return (
              <article key={line.itemId} className="card flex flex-col gap-4 p-5 sm:flex-row">
                <Link href={`/produkt/${line.slug}`} className="shrink-0">
                  <div className="h-28 w-28 overflow-hidden rounded-xl bg-mist-100">
                    {line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.imageUrl} alt={line.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-[10px] text-mist-500">
                        KEIN BILD
                      </div>
                    )}
                  </div>
                </Link>

                <div className="flex flex-1 flex-col justify-between gap-3">
                  <div>
                    <Link href={`/produkt/${line.slug}`} className="font-display text-lg font-bold hover:text-signal-600">
                      {line.name}
                    </Link>
                    {line.variantName && <p className="text-sm text-mist-700">{line.variantName}</p>}
                    <p className="code-chip mt-1.5">{line.sku}</p>
                    {overbooked && (
                      <p className="mt-2 text-sm font-semibold text-red-600">
                        Nur noch {line.available}× verfügbar – bitte Menge anpassen.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <form action={updateCartItemAction} className="flex items-center gap-2">
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <label htmlFor={`qty-${line.itemId}`} className="sr-only">Menge</label>
                      <input
                        id={`qty-${line.itemId}`}
                        type="number"
                        name="quantity"
                        min={0}
                        defaultValue={line.quantity}
                        className="field w-20 py-2 text-center tabular"
                      />
                      <button type="submit" className="text-sm font-semibold text-signal-600 hover:underline">
                        Aktualisieren
                      </button>
                    </form>

                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="font-display text-lg font-extrabold tabular">{formatCents(line.lineTotalCents)}</p>
                        <p className="text-xs text-mist-500 tabular">{formatCents(line.unitPriceCents)} / Stück</p>
                      </div>
                      <form action={removeCartItemAction}>
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <button type="submit" className="text-sm text-mist-500 underline hover:text-red-600">
                          Entfernen
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="font-display text-xl font-bold">Zusammenfassung</h2>
            <dl className="mt-5 space-y-3 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-mist-700">Zwischensumme</dt>
                <dd className="font-semibold tabular">{formatCents(cart.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-700">Versand ab</dt>
                <dd className="font-semibold tabular">{formatCents(cheapestShipping)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-mist-500">enthaltene MwSt.</dt>
                <dd className="text-mist-500 tabular">{formatCents(cart.taxCents)}</dd>
              </div>
              <div className="flex justify-between border-t-2 border-carbon-900 pt-3">
                <dt className="font-display text-lg font-extrabold">Gesamt</dt>
                <dd className="font-display text-lg font-extrabold tabular">{formatCents(total)}</dd>
              </div>
            </dl>

            <Link href="/kasse" className="btn-primary mt-6 w-full">Zur Kasse</Link>
            <Link href="/shop" className="btn-ghost mt-3 w-full">Weiter einkaufen</Link>

            <p className="mt-5 text-center font-mono text-xs text-mist-500">
              Versandart wird im nächsten Schritt gewählt
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
