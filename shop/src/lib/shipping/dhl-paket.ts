/**
 * DHL Paket – Parcel DE Shipping API v2 (Post & Parcel Germany).
 * https://developer.dhl.com/api-reference/parcel-de-shipping-post-parcel-germany-v2
 *
 * Auth: API-Key-Header + Basic Auth (Geschäftskundenportal-Zugang).
 * Das Label kommt als Base64-PDF direkt in der Antwort (`includeDocs=include`).
 */
import "server-only";

import {
  CreateLabelInput,
  CreateLabelResult,
  ShippingError,
  ShippingNotConfiguredError,
  ShippingProvider,
} from "./types";

const REQUIRED = [
  "DHL_PAKET_API_KEY",
  "DHL_PAKET_USER",
  "DHL_PAKET_PASSWORD",
  "DHL_PAKET_BILLING_NUMBER",
  "SHIP_FROM_NAME",
  "SHIP_FROM_STREET",
  "SHIP_FROM_ZIP",
  "SHIP_FROM_CITY",
] as const;

/** V01PAK = DHL Paket national, V53WPAK = Weltpaket. */
function productCode(country: string): string {
  return country.toUpperCase() === "DE" ? "V01PAK" : "V53WPAK";
}

export class DhlPaketProvider implements ShippingProvider {
  readonly code = "dhl_paket" as const;
  readonly label = "DHL Paket";
  readonly priceCents = 495;
  readonly deliveryEstimate = "2–4 Werktage";

  missingCredentials(): string[] {
    return REQUIRED.filter((name) => !process.env[name]);
  }

  isConfigured(): boolean {
    return this.missingCredentials().length === 0;
  }

  trackingUrl(trackingNumber: string): string {
    return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(trackingNumber)}`;
  }

  async createLabel(input: CreateLabelInput): Promise<CreateLabelResult> {
    const missing = this.missingCredentials();
    if (missing.length > 0) throw new ShippingNotConfiguredError(this.code, missing);

    const base = process.env.DHL_PAKET_API_BASE ?? "https://api-eu.dhl.com/parcel/de/shipping/v2";
    const auth = Buffer.from(
      `${process.env.DHL_PAKET_USER}:${process.env.DHL_PAKET_PASSWORD}`,
    ).toString("base64");

    const recipientName = [input.recipient.firstName, input.recipient.lastName]
      .filter(Boolean)
      .join(" ");

    const body = {
      profile: "STANDARD_GRUPPENPROFIL",
      shipments: [
        {
          product: productCode(input.recipient.country),
          billingNumber: process.env.DHL_PAKET_BILLING_NUMBER,
          refNo: input.orderNumber,
          shipper: {
            name1: process.env.SHIP_FROM_NAME,
            addressStreet: process.env.SHIP_FROM_STREET,
            addressHouse: process.env.SHIP_FROM_HOUSE_NUMBER ?? "",
            postalCode: process.env.SHIP_FROM_ZIP,
            city: process.env.SHIP_FROM_CITY,
            country: (process.env.SHIP_FROM_COUNTRY ?? "DEU").length === 2
              ? iso2ToIso3(process.env.SHIP_FROM_COUNTRY ?? "DE")
              : process.env.SHIP_FROM_COUNTRY,
            email: process.env.SHIP_FROM_EMAIL,
            phone: process.env.SHIP_FROM_PHONE,
          },
          consignee: {
            name1: input.recipient.company || recipientName,
            ...(input.recipient.company ? { name2: recipientName } : {}),
            addressStreet: input.recipient.street,
            addressHouse: input.recipient.houseNumber,
            additionalAddressInformation1: input.recipient.addressAddition ?? undefined,
            postalCode: input.recipient.zip,
            city: input.recipient.city,
            country: iso2ToIso3(input.recipient.country),
            email: input.recipient.email ?? undefined,
            phone: input.recipient.phone ?? undefined,
          },
          details: {
            dim:
              input.parcel.lengthMm && input.parcel.widthMm && input.parcel.heightMm
                ? {
                    uom: "mm",
                    length: input.parcel.lengthMm,
                    width: input.parcel.widthMm,
                    height: input.parcel.heightMm,
                  }
                : undefined,
            weight: { uom: "g", value: Math.max(input.parcel.weightGrams, 100) },
          },
        },
      ],
    };

    const response = await fetch(`${base}/orders?includeDocs=include&printFormat=910-300-700`, {
      method: "POST",
      headers: {
        "dhl-api-key": process.env.DHL_PAKET_API_KEY!,
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as DhlPaketResponse;

    if (!response.ok) {
      throw new ShippingError(
        `DHL Paket meldet HTTP ${response.status}: ${describeDhlError(payload)}`,
        this.code,
        payload,
      );
    }

    const item = payload.items?.[0];
    if (!item?.shipmentNo) {
      throw new ShippingError(
        `DHL Paket lieferte keine Sendungsnummer: ${describeDhlError(payload)}`,
        this.code,
        payload,
      );
    }
    if (!item.label?.b64) {
      throw new ShippingError(
        "DHL Paket lieferte kein Label-PDF. Prüfen Sie die Abrechnungsnummer und das Druckformat.",
        this.code,
        payload,
      );
    }

    return {
      trackingNumber: item.shipmentNo,
      trackingUrl: this.trackingUrl(item.shipmentNo),
      labelBase64: item.label.b64,
      labelFormat: "PDF",
      raw: payload as unknown as Record<string, unknown>,
    };
  }
}

type DhlPaketResponse = {
  status?: { title?: string; detail?: string };
  items?: {
    shipmentNo?: string;
    sstatus?: { title?: string; detail?: string };
    validationMessages?: { validationMessage?: string; property?: string }[];
    label?: { b64?: string; url?: string; printFormat?: string };
  }[];
};

function describeDhlError(payload: DhlPaketResponse): string {
  const messages = payload.items?.flatMap(
    (item) => item.validationMessages?.map((m) => `${m.property ?? ""} ${m.validationMessage ?? ""}`.trim()) ?? [],
  );
  return (
    [payload.status?.detail, payload.status?.title, ...(messages ?? [])].filter(Boolean).join(" | ") ||
    "keine Detailangabe"
  );
}

/** DHL erwartet dreistellige ISO-Ländercodes. */
export function iso2ToIso3(code: string): string {
  const map: Record<string, string> = {
    DE: "DEU", AT: "AUT", CH: "CHE", NL: "NLD", BE: "BEL", LU: "LUX", FR: "FRA",
    IT: "ITA", ES: "ESP", PT: "PRT", DK: "DNK", SE: "SWE", FI: "FIN", NO: "NOR",
    PL: "POL", CZ: "CZE", SK: "SVK", HU: "HUN", SI: "SVN", HR: "HRV", GB: "GBR",
    IE: "IRL", US: "USA",
  };
  const upper = code.toUpperCase();
  return map[upper] ?? upper;
}
