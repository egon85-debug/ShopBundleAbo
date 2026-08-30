/**
 * DHL Express – MyDHL API.
 * https://developer.dhl.com/api-reference/dhl-express-mydhl-api
 *
 * Auth: Basic Auth (API-Key/Secret). Das Label kommt als Base64-PDF im
 * `documents`-Array der Antwort.
 */
import "server-only";

import {
  CreateLabelInput,
  CreateLabelResult,
  ShippingError,
  ShippingNotConfiguredError,
  ShippingProvider,
  TrackingEventResult,
} from "./types";

const REQUIRED = [
  "DHL_EXPRESS_API_KEY",
  "DHL_EXPRESS_API_SECRET",
  "DHL_EXPRESS_ACCOUNT_NUMBER",
  "SHIP_FROM_NAME",
  "SHIP_FROM_STREET",
  "SHIP_FROM_ZIP",
  "SHIP_FROM_CITY",
  "SHIP_FROM_PHONE",
] as const;

export class DhlExpressProvider implements ShippingProvider {
  readonly code = "dhl_express" as const;
  readonly label = "DHL Express";
  readonly priceCents = 1990;
  readonly deliveryEstimate = "1–2 Werktage";

  missingCredentials(): string[] {
    return REQUIRED.filter((name) => !process.env[name]);
  }

  isConfigured(): boolean {
    return this.missingCredentials().length === 0;
  }

  trackingUrl(trackingNumber: string): string {
    return `https://www.dhl.com/de-de/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;
  }

  private authHeader(): string {
    const auth = Buffer.from(
      `${process.env.DHL_EXPRESS_API_KEY}:${process.env.DHL_EXPRESS_API_SECRET}`,
    ).toString("base64");
    return `Basic ${auth}`;
  }

  async createLabel(input: CreateLabelInput): Promise<CreateLabelResult> {
    const missing = this.missingCredentials();
    if (missing.length > 0) throw new ShippingNotConfiguredError(this.code, missing);

    const base = process.env.DHL_EXPRESS_API_BASE ?? "https://express.api.dhl.com/mydhlapi";
    const isDomestic = input.recipient.country.toUpperCase() === (process.env.SHIP_FROM_COUNTRY ?? "DE").toUpperCase();
    const currency = input.currency ?? "EUR";
    const recipientName = [input.recipient.firstName, input.recipient.lastName].filter(Boolean).join(" ");

    const body = {
      // Abholung am nächsten Werktag, 14:00 Ortszeit.
      plannedShippingDateAndTime: nextBusinessDayIso(),
      pickup: { isRequested: false },
      productCode: isDomestic ? "N" : "P", // N = Domestic Express, P = Express Worldwide
      accounts: [{ typeCode: "shipper", number: process.env.DHL_EXPRESS_ACCOUNT_NUMBER }],
      customerDetails: {
        shipperDetails: {
          postalAddress: {
            postalCode: process.env.SHIP_FROM_ZIP,
            cityName: process.env.SHIP_FROM_CITY,
            countryCode: (process.env.SHIP_FROM_COUNTRY ?? "DE").toUpperCase(),
            addressLine1: `${process.env.SHIP_FROM_STREET} ${process.env.SHIP_FROM_HOUSE_NUMBER ?? ""}`.trim(),
          },
          contactInformation: {
            phone: process.env.SHIP_FROM_PHONE,
            companyName: process.env.SHIP_FROM_NAME,
            fullName: process.env.SHIP_FROM_NAME,
            email: process.env.SHIP_FROM_EMAIL,
          },
        },
        receiverDetails: {
          postalAddress: {
            postalCode: input.recipient.zip,
            cityName: input.recipient.city,
            countryCode: input.recipient.country.toUpperCase(),
            provinceCode: input.recipient.state ?? undefined,
            addressLine1: `${input.recipient.street} ${input.recipient.houseNumber}`.trim(),
            addressLine2: input.recipient.addressAddition ?? undefined,
          },
          contactInformation: {
            phone: input.recipient.phone ?? process.env.SHIP_FROM_PHONE,
            companyName: input.recipient.company || recipientName,
            fullName: recipientName,
            email: input.recipient.email ?? undefined,
          },
        },
      },
      content: {
        packages: [
          {
            weight: Math.max(input.parcel.weightGrams / 1000, 0.1),
            dimensions: {
              length: Math.max(Math.round((input.parcel.lengthMm ?? 200) / 10), 1),
              width: Math.max(Math.round((input.parcel.widthMm ?? 150) / 10), 1),
              height: Math.max(Math.round((input.parcel.heightMm ?? 100) / 10), 1),
            },
            customerReferences: [{ value: input.orderNumber, typeCode: "CU" }],
          },
        ],
        isCustomsDeclarable: !isDomestic,
        description: input.contentDescription ?? `Bestellung ${input.orderNumber}`,
        incoterm: "DAP",
        unitOfMeasurement: "metric",
        declaredValue: input.valueCents ? Number((input.valueCents / 100).toFixed(2)) : undefined,
        declaredValueCurrency: input.valueCents ? currency : undefined,
      },
      outputImageProperties: {
        imageOptions: [{ typeCode: "label", templateName: "ECOM26_84_A4_001", isRequested: true }],
      },
      customerReferences: [{ value: input.orderNumber, typeCode: "CU" }],
    };

    const response = await fetch(`${base}/shipments`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Message-Reference": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as DhlExpressResponse;

    if (!response.ok) {
      const detail =
        [payload.detail, payload.title, ...(payload.additionalDetails ?? [])].filter(Boolean).join(" | ") ||
        "keine Detailangabe";
      throw new ShippingError(`DHL Express meldet HTTP ${response.status}: ${detail}`, this.code, payload);
    }

    const tracking = payload.shipmentTrackingNumber;
    const label = payload.documents?.find((doc) => doc.typeCode === "label") ?? payload.documents?.[0];

    if (!tracking) {
      throw new ShippingError("DHL Express lieferte keine Sendungsnummer.", this.code, payload);
    }
    if (!label?.content) {
      throw new ShippingError("DHL Express lieferte kein Label-Dokument.", this.code, payload);
    }

    return {
      trackingNumber: tracking,
      trackingUrl: this.trackingUrl(tracking),
      labelBase64: label.content,
      labelFormat: label.imageFormat ?? "PDF",
      raw: payload as unknown as Record<string, unknown>,
    };
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingEventResult[]> {
    if (!this.isConfigured()) return [];
    const base = process.env.DHL_EXPRESS_API_BASE ?? "https://express.api.dhl.com/mydhlapi";
    const response = await fetch(
      `${base}/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
      { headers: { Authorization: this.authHeader(), Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      shipments?: { events?: { date?: string; time?: string; description?: string; typeCode?: string; serviceArea?: { description?: string }[] }[] }[];
    };
    return (payload.shipments?.[0]?.events ?? []).map((event) => ({
      status: event.typeCode ?? "event",
      description: event.description,
      location: event.serviceArea?.[0]?.description,
      occurredAt: new Date(`${event.date ?? new Date().toISOString().slice(0, 10)}T${event.time ?? "00:00:00"}`),
    }));
  }
}

type DhlExpressResponse = {
  shipmentTrackingNumber?: string;
  documents?: { imageFormat?: string; content?: string; typeCode?: string }[];
  title?: string;
  detail?: string;
  additionalDetails?: string[];
};

/** Nächster Werktag, 14:00 – DHL Express verlangt ein Datum in der Zukunft. */
export function nextBusinessDayIso(from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T14:00:00 GMT+01:00`;
}
