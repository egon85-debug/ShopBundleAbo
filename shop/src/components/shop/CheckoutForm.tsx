"use client";

import { useState } from "react";

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
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {/* Kundendaten */}
        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Kontakt</h2>
          <p className="mt-1 text-sm text-mist-700">
            Bestellbestätigung und Tracking gehen an diese Adresse. Ein Kundenkonto ist nicht erforderlich.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="email" className="label">E-Mail *</label>
              <input id="email" name="email" type="email" required defaultValue={customer?.email ?? ""} className="field" />
            </div>
            <div>
              <label htmlFor="phone" className="label">Telefon (optional)</label>
              <input id="phone" name="phone" type="tel" className="field" />
            </div>
          </div>

          {!customer && (
            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(event) => setCreateAccount(event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500"
              />
              <span className="text-[15px]">
                <span className="font-semibold">Kundenkonto anlegen</span>
                <span className="block text-sm text-mist-700">Bestellhistorie, Rechnungen und schnellere Bestellungen.</span>
              </span>
            </label>
          )}
          {createAccount && (
            <div className="mt-4">
              <label htmlFor="password" className="label">Passwort (min. 10 Zeichen) *</label>
              <input id="password" name="password" type="password" minLength={10} required className="field" />
            </div>
          )}
        </section>

        {/* Lieferadresse */}
        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Lieferadresse</h2>
          <AddressFields prefix="s" defaults={{ firstName: customer?.firstName ?? "", lastName: customer?.lastName ?? "" }} />

          <label className="mt-5 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={billingSame}
              onChange={(event) => setBillingSame(event.target.checked)}
              className="h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500"
            />
            <span className="text-[15px] font-semibold">Rechnungsadresse entspricht der Lieferadresse</span>
          </label>
        </section>

        {!billingSame && (
          <section className="card p-6">
            <h2 className="font-display text-xl font-bold">Rechnungsadresse</h2>
            <AddressFields prefix="b" />
          </section>
        )}

        {/* Versandart */}
        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Versandart</h2>
          <div className="mt-4 space-y-3">
            {shippingOptions.map((option) => (
              <label
                key={option.code}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border-2 p-4 transition-colors ${
                  shippingMethod === option.code ? "border-signal-500 bg-signal-50" : "border-mist-200 hover:border-mist-300"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={option.code}
                    checked={shippingMethod === option.code}
                    onChange={() => setShippingMethod(option.code)}
                    className="h-5 w-5 border-mist-300 text-signal-500 focus:ring-signal-500"
                  />
                  <span>
                    <span className="block font-display font-bold">{option.label}</span>
                    <span className="block text-sm text-mist-700">Lieferzeit {option.deliveryEstimate}</span>
                  </span>
                </span>
                <span className="font-display font-bold tabular">{formatCents(option.priceCents)}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <label htmlFor="customerNote" className="label">Anmerkung zur Bestellung (optional)</label>
          <textarea id="customerNote" name="customerNote" rows={3} className="field" maxLength={1000} />
        </section>
      </div>

      {/* Zusammenfassung */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-6">
          <h2 className="font-display text-xl font-bold">Ihre Bestellung</h2>

          <ul className="mt-5 space-y-3">
            {cart.lines.map((line) => (
              <li key={line.itemId} className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-mist-100">
                  {line.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-1 justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold">{line.name}</span>
                    {line.variantName && <span className="block text-mist-700">{line.variantName}</span>}
                    <span className="block text-mist-500">{line.quantity} ×</span>
                  </span>
                  <span className="font-semibold tabular">{formatCents(line.lineTotalCents)}</span>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2.5 border-t border-mist-200 pt-5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-mist-700">Zwischensumme</dt>
              <dd className="tabular">{formatCents(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist-700">Versand ({shipping?.label})</dt>
              <dd className="tabular">{formatCents(shippingCents)}</dd>
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

          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="acceptsTerms" required className="mt-1 h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500" />
            <span className="text-sm text-mist-700">
              Ich akzeptiere die <a href="/agb" className="underline">AGB</a> und die{" "}
              <a href="/widerruf" className="underline">Widerrufsbelehrung</a>. *
            </span>
          </label>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary mt-5 w-full" disabled={pending}>
            {pending ? "Bestellung wird angelegt …" : "Zahlungspflichtig bestellen"}
          </button>
          <p className="mt-3 text-center font-mono text-xs text-mist-500">
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
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-company`} className="label">Firma (optional)</label>
        <input id={`${prefix}-company`} name={`${prefix}-company`} className="field" />
      </div>
      <div>
        <label htmlFor={`${prefix}-firstName`} className="label">Vorname *</label>
        <input id={`${prefix}-firstName`} name={`${prefix}-firstName`} required defaultValue={defaults?.firstName} className="field" />
      </div>
      <div>
        <label htmlFor={`${prefix}-lastName`} className="label">Nachname *</label>
        <input id={`${prefix}-lastName`} name={`${prefix}-lastName`} required defaultValue={defaults?.lastName} className="field" />
      </div>
      <div className="sm:col-span-2 grid grid-cols-[1fr_120px] gap-4">
        <div>
          <label htmlFor={`${prefix}-street`} className="label">Straße *</label>
          <input id={`${prefix}-street`} name={`${prefix}-street`} required className="field" />
        </div>
        <div>
          <label htmlFor={`${prefix}-houseNumber`} className="label">Nr. *</label>
          <input id={`${prefix}-houseNumber`} name={`${prefix}-houseNumber`} required className="field" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-addressAddition`} className="label">Adresszusatz (optional)</label>
        <input id={`${prefix}-addressAddition`} name={`${prefix}-addressAddition`} className="field" />
      </div>
      <div>
        <label htmlFor={`${prefix}-zip`} className="label">PLZ *</label>
        <input id={`${prefix}-zip`} name={`${prefix}-zip`} required className="field tabular" />
      </div>
      <div>
        <label htmlFor={`${prefix}-city`} className="label">Ort *</label>
        <input id={`${prefix}-city`} name={`${prefix}-city`} required className="field" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-country`} className="label">Land *</label>
        <select id={`${prefix}-country`} name={`${prefix}-country`} defaultValue="DE" className="field">
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
