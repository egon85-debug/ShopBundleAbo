import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { Ueberschrift } from "@/components/ui/Gestaltung";
import { getCurrentCustomer } from "@/lib/auth";
import { stripeConfigured } from "@/lib/stripe";
import { shippingOptions } from "@/lib/shipping/registry";
import { getCart } from "@/services/cart";

export const metadata: Metadata = { title: "Kasse", robots: { index: false } };

export default async function CheckoutPage() {
  const [cart, customer] = await Promise.all([getCart(), getCurrentCustomer()]);
  if (!cart || cart.lines.length === 0) redirect("/warenkorb");

  return (
    <div className="seite py-12 lg:py-16">
      <Schrittfolge aktiv={1} />

      <Ueberschrift als="h1" groesse="gross" className="mt-12">Kasse</Ueberschrift>

      {!stripeConfigured() && (
        <div className="karte-hervor mt-8 p-5">
          <p className="font-medium">Stripe ist noch nicht eingerichtet</p>
          <p className="mt-1 text-body-sm text-kohle">
            Bestellungen können angelegt werden, die Zahlung startet jedoch erst, sobald{" "}
            <code>STRIPE_SECRET_KEY</code> und <code>STRIPE_WEBHOOK_SECRET</code> in den
            Umgebungsvariablen hinterlegt sind.
          </p>
        </div>
      )}

      <div className="mt-10">
        <CheckoutForm
          cart={{
            lines: cart.lines.map((line) => ({
              itemId: line.itemId,
              name: line.name,
              variantName: line.variantName,
              quantity: line.quantity,
              lineTotalCents: line.lineTotalCents,
              imageUrl: line.imageUrl,
            })),
            subtotalCents: cart.subtotalCents,
            taxCents: cart.taxCents,
            itemCount: cart.itemCount,
          }}
          shippingOptions={shippingOptions()}
          customer={
            customer
              ? { email: customer.email, firstName: customer.firstName, lastName: customer.lastName }
              : null
          }
        />
      </div>

      <p className="mt-10 text-body-sm text-kohle">
        Mit der Bestellung akzeptieren Sie unsere{" "}
        <Link href="/agb" className="underline underline-offset-4 hover:text-tinte">AGB</Link> und die{" "}
        <Link href="/widerruf" className="underline underline-offset-4 hover:text-tinte">Widerrufsbelehrung</Link>.
      </p>
    </div>
  );
}

const SCHRITTE = ["Warenkorb", "Kundendaten", "Versand", "Zahlung", "Bestätigung"];

/** Fortschritt als Schrittzeile: aktiver Schritt mit oranger Plakette. */
function Schrittfolge({ aktiv }: { aktiv: number }) {
  return (
    <nav aria-label="Bestellschritte">
      {/* Am Handy nur der aktuelle Schritt, ab sm die ganze Zeile. */}
      <ol className="grid gap-6 sm:grid-cols-5">
        {SCHRITTE.map((schritt, index) => {
          const istAktiv = index === aktiv;
          return (
            <li
              key={schritt}
              aria-current={istAktiv ? "step" : undefined}
              className={istAktiv ? undefined : "hidden sm:block"}
            >
              <span className={istAktiv ? "plakette-aktiv" : "plakette px-0 text-asche"}>
                Schritt {index + 1}
                <span className="sm:hidden"> von {SCHRITTE.length}</span>
              </span>
              <p
                className={`mt-2 pb-2 text-subheading ${
                  istAktiv ? "border-b-2 border-haarlinie font-medium text-tinte" : "border-b border-haarlinie text-kohle"
                }`}
              >
                {schritt}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
