"use client";

import { useState } from "react";

import { ProduktBild } from "@/components/ui/Gestaltung";
import { formatCents } from "@/lib/money";

type ShippingOption = {
  code: string;
  label: string;
  priceCents: number;
  deliveryEstimate: string;
  isConfigured: boolean;
};

type CheckoutCart = {
  lines: {
    itemId: string;
    name: string;
    variantName: string | null;
    quantity: number;
    lineTotalCents: number;
    imageUrl: string | null;
  }[];
  subtotalCents: number;
  taxCents: number;
  itemCount: number;
};

/**
 * Checkout in einem Schritt (Kundendaten → Adresse → Versand → Zahlung).
 * Der Absenden-Button legt die Bestellung serverseitig an und leitet zu Stripe
 * Checkout weiter; Beträge werden dabei ausschließlich serverseitig berechnet.
 */
export function CheckoutForm({
  cart,
  shippingOptions,
  customer,
}: {
  cart: CheckoutCart;
  shippingOptions: ShippingOption[];
  customer: { email: string; firstName: string | null; lastName: string | null } | null;
}) {
  const [shippingMethod, setShippingMethod] = useState(shippingOptions[0]?.code ?? "dhl_paket");
  const [billingSame, setBillingSame] = useState(true);
  const [createAccount, setCreateAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const shipping = shippingOptions.find((option) => option.code === shippingMethod);
  const shippingCents = shipping?.priceCents ?? 0;
  const total = cart.subtotalCents + shippingCents;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      shippingMethod,
      billingSameAsShipping: billingSame,
      createAccount,
      password: createAccount ? String(formData.get("password") ?? "") : undefined,
      acceptsTerms: formData.get("acceptsTerms") === "on",
      customerNote: String(formData.get("customerNote") ?? "") || null,
      shippingAddress: readAddress(formData, "s"),
      billingAddress: billingSame ? undefined : readAddress(formData, "b"),
    };

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { url?: string; orderNumber?: string; error?: string };

      if (!response.ok) {
        setError(result.error ?? "Die Bestellung konnte nicht angelegt werden.");
        setPending(false);
        return;
      }
      // Mit Stripe: Weiterleitung zur gehosteten Zahlungsseite.
      // Ohne Stripe: direkt zur Bestellübersicht (Zahlung noch offen).
      window.location.href = result.url ?? `/bestellung/${result.orderNumber}`;
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* Kundendaten */}
        <section className="karte p-6">
          <h2 className="text-heading-sm font-medium">Kontakt</h2>
          <p className="mt-1 text-body-sm text-kohle">
            Bestellbestätigung und Tracking gehen an diese Adresse. Ein Kundenkonto ist nicht erforderlich.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="email" className="feldname">E-Mail *</label>
              <input id="email" name="email" type="email" required defaultValue={customer?.email ?? ""} className="feld" />
            </div>
            <div>
              <label htmlFor="phone" className="feldname">Telefon (optional)</label>
              <input id="phone" name="phone" type="tel" className="feld" />
            </div>
          </div>

          {!customer && (
            <label className="mt-6 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(event) => setCreateAccount(event.target.checked)}
                className="auswahl mt-0.5"
              />
              <span className="text-body">
                <span className="font-medium">Kundenkonto anlegen</span>
                <span className="block text-body-sm text-kohle">Bestellhistorie, Rechnungen und schnellere Bestellungen.</span>
              </span>
            </label>
          )}
          {createAccount && (
            <div className="mt-4">
              <label htmlFor="password" className="feldname">Passwort (min. 10 Zeichen) *</label>
              <input id="password" name="password" type="password" minLength={10} required className="feld" />
            </div>
          )}
        </section>

        {/* Lieferadresse */}
        <section className="karte p-6">
          <h2 className="text-heading-sm font-medium">Lieferadresse</h2>
          <AddressFields prefix="s" defaults={{ firstName: customer?.firstName ?? "", lastName: customer?.lastName ?? "" }} />

          <label className="mt-6 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={billingSame}
              onChange={(event) => setBillingSame(event.target.checked)}
              className="auswahl"
            />
            <span className="text-body">Rechnungsadresse entspricht der Lieferadresse</span>
          </label>
        </section>

        {!billingSame && (
          <section className="karte p-6">
            <h2 className="text-heading-sm font-medium">Rechnungsadresse</h2>
            <AddressFields prefix="b" />
          </section>
        )}

        {/* Versandart */}
        <section className="karte p-6">
          <h2 className="text-heading-sm font-medium">Versandart</h2>
          <div className="mt-5 space-y-3">
            {shippingOptions.map((option) => (
              <label
                key={option.code}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-karte border p-4 transition-colors ${
                  shippingMethod === option.code ? "border-akzent" : "border-haarlinie hover:border-nebel"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={option.code}
                    checked={shippingMethod === option.code}
                    onChange={() => setShippingMethod(option.code)}
                    className="auswahl"
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-body-sm text-kohle">Lieferzeit {option.deliveryEstimate}</span>
                  </span>
                </span>
                <span className="font-medium tabular">{formatCents(option.priceCents)}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="karte p-6">
          <label htmlFor="customerNote" className="feldname">Anmerkung zur Bestellung (optional)</label>
          <textarea id="customerNote" name="customerNote" rows={3} className="feld-mehrzeilig" maxLength={1000} />
        </section>
      </div>

      {/* Zusammenfassung */}
      <aside className="lg:sticky lg:top-40 lg:self-start">
        <div className="karte p-6">
          <h2 className="text-heading-sm font-medium">Ihre Bestellung</h2>

          <ul className="mt-6 space-y-4">
            {cart.lines.map((line) => (
              <li key={line.itemId} className="flex gap-3">
                <ProduktBild url={line.imageUrl} alt="" klein className="h-14 w-14 shrink-0" />
                <div className="flex flex-1 justify-between gap-2 text-body-sm">
                  <span>
                    <span className="font-medium">{line.name}</span>
                    {line.variantName && <span className="block text-kohle">{line.variantName}</span>}
                    <span className="block text-schiefer">{line.quantity} ×</span>
                  </span>
                  <span className="tabular">{formatCents(line.lineTotalCents)}</span>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-6 space-y-3 border-t border-haarlinie pt-5 text-body">
            <div className="flex justify-between">
              <dt className="text-kohle">Zwischensumme</dt>
              <dd className="tabular">{formatCents(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-kohle">Versand ({shipping?.label})</dt>
              <dd className="tabular">{formatCents(shippingCents)}</dd>
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

          <label className="mt-6 flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="acceptsTerms" required className="auswahl mt-0.5" />
            <span className="text-body-sm text-kohle">
              Ich akzeptiere die <a href="/agb" className="underline underline-offset-4">AGB</a> und die{" "}
              <a href="/widerruf" className="underline underline-offset-4">Widerrufsbelehrung</a>. *
            </span>
          </label>

          {error && (
            <p className="hinweis-fehler mt-4" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="knopf-aktion mt-6 w-full" disabled={pending}>
            {pending ? "Bestellung wird angelegt …" : "Zahlungspflichtig bestellen"}
          </button>
          <p className="mt-4 text-center text-caption text-schiefer">
            Zahlung wird sicher über Stripe abgewickelt
          </p>
        </div>
      </aside>
    </form>
  );
}

function AddressFields({
  prefix,
  defaults,
}: {
  prefix: string;
  defaults?: { firstName?: string; lastName?: string };
}) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-company`} className="feldname">Firma (optional)</label>
        <input id={`${prefix}-company`} name={`${prefix}-company`} className="feld" />
      </div>
      <div>
        <label htmlFor={`${prefix}-firstName`} className="feldname">Vorname *</label>
        <input id={`${prefix}-firstName`} name={`${prefix}-firstName`} required defaultValue={defaults?.firstName} className="feld" />
      </div>
      <div>
        <label htmlFor={`${prefix}-lastName`} className="feldname">Nachname *</label>
        <input id={`${prefix}-lastName`} name={`${prefix}-lastName`} required defaultValue={defaults?.lastName} className="feld" />
      </div>
      <div className="sm:col-span-2 grid grid-cols-[1fr_120px] gap-4">
        <div>
          <label htmlFor={`${prefix}-street`} className="feldname">Straße *</label>
          <input id={`${prefix}-street`} name={`${prefix}-street`} required className="feld" />
        </div>
        <div>
          <label htmlFor={`${prefix}-houseNumber`} className="feldname">Nr. *</label>
          <input id={`${prefix}-houseNumber`} name={`${prefix}-houseNumber`} required className="feld" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-addressAddition`} className="feldname">Adresszusatz (optional)</label>
        <input id={`${prefix}-addressAddition`} name={`${prefix}-addressAddition`} className="feld" />
      </div>
      <div>
        <label htmlFor={`${prefix}-zip`} className="feldname">PLZ *</label>
        <input id={`${prefix}-zip`} name={`${prefix}-zip`} required className="feld tabular" />
      </div>
      <div>
        <label htmlFor={`${prefix}-city`} className="feldname">Ort *</label>
        <input id={`${prefix}-city`} name={`${prefix}-city`} required className="feld" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-country`} className="feldname">Land *</label>
        <select id={`${prefix}-country`} name={`${prefix}-country`} defaultValue="DE" className="feld">
          <option value="DE">Deutschland</option>
          <option value="AT">Österreich</option>
          <option value="CH">Schweiz</option>
          <option value="NL">Niederlande</option>
          <option value="BE">Belgien</option>
          <option value="LU">Luxemburg</option>
          <option value="FR">Frankreich</option>
          <option value="IT">Italien</option>
          <option value="PL">Polen</option>
          <option value="DK">Dänemark</option>
        </select>
      </div>
    </div>
  );
}

function readAddress(formData: FormData, prefix: string) {
  const value = (field: string) => {
    const raw = formData.get(`${prefix}-${field}`);
    return raw === null || raw === "" ? null : String(raw);
  };
  return {
    company: value("company"),
    firstName: value("firstName") ?? "",
    lastName: value("lastName") ?? "",
    street: value("street") ?? "",
    houseNumber: value("houseNumber") ?? "",
    addressAddition: value("addressAddition"),
    zip: value("zip") ?? "",
    city: value("city") ?? "",
    country: value("country") ?? "DE",
    phone: value("phone"),
  };
}
