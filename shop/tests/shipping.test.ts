import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DhlPaketProvider, iso2ToIso3 } from "@/lib/shipping/dhl-paket";
import { DhlExpressProvider, nextBusinessDayIso } from "@/lib/shipping/dhl-express";
import { ShippingError, ShippingNotConfiguredError } from "@/lib/shipping/types";

const recipient = {
  firstName: "Max",
  lastName: "Mustermann",
  street: "Lieferweg",
  houseNumber: "7",
  zip: "20095",
  city: "Hamburg",
  country: "DE",
};

const labelInput = {
  orderNumber: "WL-2026-000042",
  recipient,
  parcel: { weightGrams: 1200 },
  valueCents: 4990,
};

function configureDhlPaket() {
  process.env.DHL_PAKET_API_KEY = "test-key";
  process.env.DHL_PAKET_USER = "user";
  process.env.DHL_PAKET_PASSWORD = "pass";
  process.env.DHL_PAKET_BILLING_NUMBER = "33333333330102";
  process.env.SHIP_FROM_NAME = "Winterfeldt Logistik";
  process.env.SHIP_FROM_STREET = "Musterstraße";
  process.env.SHIP_FROM_HOUSE_NUMBER = "1";
  process.env.SHIP_FROM_ZIP = "12345";
  process.env.SHIP_FROM_CITY = "Musterstadt";
  process.env.SHIP_FROM_COUNTRY = "DE";
  process.env.SHIP_FROM_PHONE = "+4900000";
}

const envKeys = [
  "DHL_PAKET_API_KEY", "DHL_PAKET_USER", "DHL_PAKET_PASSWORD", "DHL_PAKET_BILLING_NUMBER",
  "DHL_EXPRESS_API_KEY", "DHL_EXPRESS_API_SECRET", "DHL_EXPRESS_ACCOUNT_NUMBER",
  "SHIP_FROM_NAME", "SHIP_FROM_STREET", "SHIP_FROM_HOUSE_NUMBER", "SHIP_FROM_ZIP",
  "SHIP_FROM_CITY", "SHIP_FROM_COUNTRY", "SHIP_FROM_PHONE",
];

describe("Versanddienstleister", () => {
  beforeEach(() => envKeys.forEach((key) => delete process.env[key]));
  afterEach(() => vi.restoreAllMocks());

  it("meldet fehlende Zugangsdaten klar statt zu scheitern", async () => {
    const provider = new DhlPaketProvider();
    expect(provider.isConfigured()).toBe(false);
    expect(provider.missingCredentials()).toContain("DHL_PAKET_API_KEY");
    await expect(provider.createLabel(labelInput)).rejects.toBeInstanceOf(ShippingNotConfiguredError);
  });

  it("erzeugt ein DHL-Paket-Label und liefert Sendungsnummer und PDF", async () => {
    configureDhlPaket();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ items: [{ shipmentNo: "00340434161094042557", label: { b64: "JVBERi0x" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new DhlPaketProvider().createLabel(labelInput);

    expect(result.trackingNumber).toBe("00340434161094042557");
    expect(result.labelBase64).toBe("JVBERi0x");
    expect(result.trackingUrl).toContain("00340434161094042557");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/orders");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.shipments[0].refNo).toBe("WL-2026-000042");
    expect(body.shipments[0].consignee.postalCode).toBe("20095");
    expect(body.shipments[0].details.weight).toEqual({ uom: "g", value: 1200 });
  });

  it("gibt DHL-Fehlermeldungen verständlich weiter", async () => {
    configureDhlPaket();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: { detail: "Abrechnungsnummer unbekannt" } }), { status: 400 }),
    );
    await expect(new DhlPaketProvider().createLabel(labelInput)).rejects.toThrow(/Abrechnungsnummer unbekannt/);
  });

  it("wandelt Ländercodes für DHL in dreistellige ISO-Codes", () => {
    expect(iso2ToIso3("DE")).toBe("DEU");
    expect(iso2ToIso3("at")).toBe("AUT");
  });

  it("erzeugt ein DHL-Express-Label mit Zolldaten für Auslandssendungen", async () => {
    configureDhlPaket();
    process.env.DHL_EXPRESS_API_KEY = "key";
    process.env.DHL_EXPRESS_API_SECRET = "secret";
    process.env.DHL_EXPRESS_ACCOUNT_NUMBER = "123456789";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          shipmentTrackingNumber: "1234567890",
          documents: [{ typeCode: "label", imageFormat: "PDF", content: "JVBERi0y" }],
        }),
        { status: 200 },
      ),
    );

    const result = await new DhlExpressProvider().createLabel({
      ...labelInput,
      recipient: { ...recipient, country: "CH", zip: "8001", city: "Zürich" },
    });

    expect(result.trackingNumber).toBe("1234567890");
    expect(result.labelBase64).toBe("JVBERi0y");
  });

  it("plant den Express-Versand auf einen Werktag", () => {
    // Samstag → nächster Termin darf kein Wochenende sein.
    const saturday = new Date("2026-08-29T10:00:00Z");
    const planned = nextBusinessDayIso(saturday);
    const day = new Date(planned.slice(0, 10)).getDay();
    expect(day).not.toBe(0);
    expect(day).not.toBe(6);
  });

  it("wirft einen ShippingError, wenn kein Label zurückkommt", async () => {
    configureDhlPaket();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ shipmentNo: "123" }] }), { status: 200 }),
    );
    await expect(new DhlPaketProvider().createLabel(labelInput)).rejects.toBeInstanceOf(ShippingError);
  });
});
