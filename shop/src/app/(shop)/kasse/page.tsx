import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { getCurrentCustomer } from "@/lib/auth";
import { stripeConfigured } from "@/lib/stripe";
import { shippingOptions } from "@/lib/shipping/registry";
import { getCart } from "@/services/cart";

export const metadata: Metadata = { title: "Kasse", robots: { index: false } };

export default async function CheckoutPage() {
  const [cart, customer] = await Promise.all([getCart(), getCurrentCustomer()]);
  if (!cart || cart.lines.length === 0) redirect("/warenkorb");

  return (
    <div className="section py-12">
      <nav aria-label="Checkout-Fortschritt" className="mb-8">
        <ol className="flex flex-wrap gap-2 font-mono text-xs">
          {["Warenkorb", "Kundendaten", "Versand", "Zahlung", "Bestätigung"].map((step, index) => (
            <li
              key={step}
              className={`rounded-full border px-3 py-1.5 ${
                index <= 1 ? "border-carbon-900 bg-carbon-900 text-white" : "border-mist-300 text-mist-500"
              }`}
            >
              {String(index + 1).padStart(2, "0")} {step}
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="font-display text-display-lg font-extrabold">Kasse</h1>

      {!stripeConfigured() && (
        <div className="mt-6 rounded-2xl border-l-4 border-beacon-500 bg-beacon-400/10 p-5">
          <p className="font-display font-bold text-carbon-900">Stripe ist noch nicht konfiguriert</p>
          <p className="mt-1 text-[15px] text-mist-700">
            Bestellungen können angelegt werden, die Zahlung startet jedoch erst, sobald{" "}
            <code className="code-chip">STRIPE_SECRET_KEY</code> und{" "}
            <code className="code-chip">STRIPE_WEBHOOK_SECRET</code> in <code className="code-chip">shop/.env</code>{" "}
            hinterlegt sind.
          </p>
        </div>
      )}

      <div className="mt-8">
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

      <p className="mt-8 text-sm text-mist-700">
        Mit der Bestellung akzeptieren Sie unsere{" "}
        <Link href="/agb" className="underline hover:text-carbon-900">AGB</Link> und die{" "}
        <Link href="/widerruf" className="underline hover:text-carbon-900">Widerrufsbelehrung</Link>.
      </p>
    </div>
  );
}
