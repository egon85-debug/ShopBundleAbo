/**
 * Einheitliches Shipping-Provider-Interface (Punkt 7/16).
 *
 * Die Bestell- und Adminlogik kennt ausschließlich diese Typen. Neue
 * Versanddienstleister werden als weitere Implementierung ergänzt und in
 * `registry.ts` registriert – ohne Änderung am übrigen Code.
 */

export type CarrierCode = "dhl_paket" | "dhl_express";

export interface ShipmentAddress {
  company?: string | null;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  addressAddition?: string | null;
  zip: string;
  city: string;
  state?: string | null;
  country: string;
  email?: string | null;
  phone?: string | null;
}

export interface ShipmentParcel {
  /** Gewicht in Gramm. */
  weightGrams: number;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}

export interface CreateLabelInput {
  orderNumber: string;
  recipient: ShipmentAddress;
  parcel: ShipmentParcel;
  /** Warenwert in Cent – für Express-Zolldaten. */
  valueCents?: number;
  currency?: string;
  contentDescription?: string;
}

export interface CreateLabelResult {
  trackingNumber: string;
  trackingUrl: string;
  /** Base64-kodiertes PDF des Versandetiketts. */
  labelBase64: string;
  labelFormat: string;
  /** Rohantwort des Carriers – wird für Support/Audit gespeichert. */
  raw: Record<string, unknown>;
}

export interface TrackingEventResult {
  status: string;
  description?: string;
  location?: string;
  occurredAt: Date;
}

/** Fehler in der Carrier-Kommunikation – nie stillschweigend schlucken. */
export class ShippingError extends Error {
  constructor(
    message: string,
    readonly carrier: CarrierCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}

/** Kennzeichnet fehlende Zugangsdaten klar gegenüber echten API-Fehlern. */
export class ShippingNotConfiguredError extends ShippingError {
  constructor(carrier: CarrierCode, missing: string[]) {
    super(
      `Versanddienstleister ${carrier} ist nicht konfiguriert. Fehlende Zugangsdaten: ${missing.join(", ")}. ` +
        `Bitte in shop/.env hinterlegen (Vorlage: shop/.env.example).`,
      carrier,
    );
    this.name = "ShippingNotConfiguredError";
  }
}

export interface ShippingProvider {
  readonly code: CarrierCode;
  readonly label: string;
  /** Versandkosten in Cent für die Checkout-Anzeige. */
  readonly priceCents: number;
  readonly deliveryEstimate: string;
  /** Sind alle Zugangsdaten hinterlegt? Steuert die Anzeige im Admin. */
  isConfigured(): boolean;
  /** Fehlende Env-Variablen – für eine präzise Fehlermeldung im Admin. */
  missingCredentials(): string[];
  createLabel(input: CreateLabelInput): Promise<CreateLabelResult>;
  trackingUrl(trackingNumber: string): string;
  fetchTracking?(trackingNumber: string): Promise<TrackingEventResult[]>;
}
