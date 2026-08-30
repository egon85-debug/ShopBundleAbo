import "server-only";

import { DhlExpressProvider } from "./dhl-express";
import { DhlPaketProvider } from "./dhl-paket";
import { CarrierCode, ShippingProvider } from "./types";

/**
 * Registry aller Versanddienstleister. Ein weiterer Carrier wird hier
 * eingetragen – Checkout, Admin und E-Mails ändern sich nicht.
 */
const providers: Record<CarrierCode, ShippingProvider> = {
  dhl_paket: new DhlPaketProvider(),
  dhl_express: new DhlExpressProvider(),
};

export function getShippingProvider(code: CarrierCode): ShippingProvider {
  const provider = providers[code];
  if (!provider) throw new Error(`Unbekannte Versandart: ${code}`);
  return provider;
}

/** Versandarten für Checkout-Anzeige und Admin-Auswahl. */
export function listShippingProviders(): ShippingProvider[] {
  return Object.values(providers);
}

export function shippingOptions() {
  return listShippingProviders().map((provider) => ({
    code: provider.code,
    label: provider.label,
    priceCents: provider.priceCents,
    deliveryEstimate: provider.deliveryEstimate,
    isConfigured: provider.isConfigured(),
  }));
}

export * from "./types";
