import type { Metadata } from "next";
import Link from "next/link";

import { removeCartItemAction, updateCartItemAction } from "@/app/actions/shop";
import { ProduktBild, Ueberschrift } from "@/components/ui/Gestaltung";
import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";
import { getCart } from "@/services/cart";

export const metadata: Metadata = { title: "Warenkorb", robots: { index: false } };

export default async function CartPage() {
  const cart = await getCart();
  const cheapestShipping = Math.min(...shippingOptions().map((option) => option.priceCents));

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="seite py-20 lg:py-28">
        <div className="mx-auto max-w-lg text-center">
          <Ueberschrift als="h1" groesse="gross" mitte>Ihr Warenkorb ist leer</Ueberschrift>
          <p className="mt-6 text-kohle">Stöbern Sie im Sortiment und legen Sie Artikel in den Warenkorb.</p>
          <Link href="/shop" className="knopf-aktion mt-10">Zum Shop</Link>
        </div>
      </div>
    );
  }

  const total = cart.subtotalCents + cart.depositCents + cheapestShipping;

  return (
    <div className="seite py-12 lg:py-16">
      <Ueberschrift als="h1" groesse="gross" augenbraue={`${cart.itemCount} Artikel`}>Warenkorb</Ueberschrift>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="divide-y divide-haarlinie border-y border-haarlinie">
          {cart.lines.map((line) => {
            const overbooked = !line.allowBackorder && line.quantity > line.available;
            return (
              <article key={line.itemId} className="flex flex-col gap-5 py-6 sm:flex-row">
                <Link href={`/produkt/${line.slug}`} className="shrink-0">
                  <ProduktBild url={line.imageUrl} alt={line.name} className="h-28 w-28" />
                </Link>

                <div className="flex flex-1 flex-col justify-between gap-4">
                  <div>
                    <Link href={`/produkt/${line.slug}`} className="text-subheading font-medium hover:underline hover:underline-offset-4">
                      {line.name}
                    </Link>
                    {line.variantName && <p className="text-body-sm text-kohle">{line.variantName}</p>}
                    <p className="nummer mt-1">{line.sku}</p>
                    {overbooked && (
                      <p className="hinweis-fehler mt-3">
                        Nur noch {line.available}× verfügbar – bitte Menge anpassen.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <form action={updateCartItemAction} className="flex items-center gap-3">
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <label htmlFor={`qty-${line.itemId}`} className="sr-only">Menge</label>
                      <input
                        id={`qty-${line.itemId}`}
                        type="number"
                        name="quantity"
                        min={0}
                        defaultValue={line.quantity}
                        className="feld w-24 py-2 text-center tabular"
                      />
                      <button type="submit" className="textlink text-body-sm">
                        Aktualisieren
                      </button>
                    </form>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-subheading font-medium tabular">{formatCents(line.lineTotalCents)}</p>
                        <p className="text-caption text-schiefer tabular">{formatCents(line.unitPriceCents)} / Stück</p>
                      </div>
                      <form action={removeCartItemAction}>
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <button type="submit" className="text-body-sm text-schiefer underline underline-offset-4 hover:text-tinte">
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

        <aside className="lg:sticky lg:top-40 lg:self-start">
          <div className="karte p-6">
            <h2 className="text-heading-sm font-medium">Zusammenfassung</h2>
            <dl className="mt-6 space-y-3 text-body">
              <div className="flex justify-between">
                <dt className="text-kohle">Zwischensumme</dt>
                <dd className="tabular">{formatCents(cart.subtotalCents)}</dd>
              </div>
              {cart.depositCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-kohle">Pfand</dt>
                  <dd className="tabular">{formatCents(cart.depositCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-kohle">Versand ab</dt>
                <dd className="tabular">{formatCents(cheapestShipping)}</dd>
              </div>
              <div className="flex justify-between text-body-sm">
                <dt className="text-schiefer">enthaltene MwSt.</dt>
                <dd className="text-schiefer tabular">{formatCents(cart.taxCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-haarlinie pt-4">
                <dt className="text-subheading font-medium">Gesamt</dt>
                <dd className="text-subheading font-medium tabular">{formatCents(total)}</dd>
              </div>
            </dl>

            <Link href="/kasse" className="knopf-aktion mt-8 w-full">Zur Kasse</Link>
            <Link href="/shop" className="knopf-zweit mt-3 w-full">Weiter einkaufen</Link>

            <p className="mt-5 text-center text-caption text-schiefer">
              Die Versandart wählen Sie im nächsten Schritt.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
