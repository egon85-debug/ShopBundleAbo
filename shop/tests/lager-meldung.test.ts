import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  lagerAenderungen,
  meldeProduktAenderung,
  meldeVerkauf,
  meldungKonfiguriert,
  meldungsHinweis,
  produktAdresse,
  signiereMeldung,
} from "@/lib/lager-meldung";

const URL_ALT = process.env.LAGER_WEBHOOK_URL;
const SECRET_ALT = process.env.LAGER_WEBHOOK_SECRET;

afterEach(() => {
  process.env.LAGER_WEBHOOK_URL = URL_ALT;
  process.env.LAGER_WEBHOOK_SECRET = SECRET_ALT;
  vi.unstubAllGlobals();
});

describe("Verkaufsmeldung an die Lagererfassung", () => {
  it("meldet nichts, solange sie nicht eingerichtet ist", async () => {
    delete process.env.LAGER_WEBHOOK_URL;
    delete process.env.LAGER_WEBHOOK_SECRET;
    expect(meldungKonfiguriert(undefined, undefined)).toBe(false);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(meldeVerkauf("WL-2026-1", [{ sku: "A", quantity: 1 }])).resolves.toEqual({
      gemeldet: false,
      grund: "nicht_konfiguriert",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendet signierte Positionen und lässt Nullmengen weg", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/shop/webhooks/abc/order";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const ergebnis = await meldeVerkauf("WL-2026-1", [
      { sku: "WL-1001", quantity: 2 },
      { sku: "WL-1002", quantity: 0 },
    ]);

    expect(ergebnis).toEqual({ gemeldet: true });
    const [url, optionen] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lager.example.de/shop/webhooks/abc/order");

    const koerper = optionen.body as string;
    expect(JSON.parse(koerper)).toEqual({
      order_id: "WL-2026-1",
      items: [{ sku: "WL-1001", quantity: 2 }],
    });

    const kopf = optionen.headers as Record<string, string>;
    const erwartet = createHmac("sha256", "s".repeat(40)).update(koerper).digest("hex");
    expect(kopf["X-Webhook-Signature"]).toBe(erwartet);
    expect(signiereMeldung(koerper, "s".repeat(40))).toBe(erwartet);
  });

  it("wirft nicht, wenn das Lager nicht erreichbar ist", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/hook";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    // Eine bezahlte Bestellung darf daran nicht scheitern.
    await expect(meldeVerkauf("WL-2026-2", [{ sku: "A", quantity: 1 }])).resolves.toEqual({
      gemeldet: false,
      grund: "nicht_erreichbar",
    });
  });

  it("meldet einen abgelehnten Aufruf mit Statuscode zurück", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/hook";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nein", { status: 401 })));

    await expect(meldeVerkauf("WL-2026-3", [{ sku: "A", quantity: 1 }])).resolves.toEqual({
      gemeldet: false,
      grund: "http_401",
    });
  });
});

describe("Änderungen aus dem Shop-Admin ans Lager", () => {
  it("leitet die Produktadresse von der Bestelladresse ab", () => {
    expect(produktAdresse("https://lager.example.de/api/v1/shop/webhooks/abc/order")).toBe(
      "https://lager.example.de/api/v1/shop/webhooks/abc/product",
    );
    expect(produktAdresse("https://lager.example.de/hook")).toBeNull();
  });

  it("meldet nur geänderte Lagerfelder", () => {
    expect(
      lagerAenderungen(
        { name: "Alt", priceCents: 1000, description: null, seoTitle: "T" },
        { name: "Neu", priceCents: 1000, description: null, seoTitle: null },
      ),
    ).toEqual({ name: "Neu", seoTitle: null });
  });

  it("sendet signiert und erkennt Artikel, die das Lager nicht kennt", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/shop/webhooks/abc/order";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);
    const fetchMock = vi.fn(async () => Response.json({ sku: "WL-TAP-48", status: "unknown_sku" }));
    vi.stubGlobal("fetch", fetchMock);

    const ergebnis = await meldeProduktAenderung("WL-TAP-48", "delete");
    expect(ergebnis).toEqual({ gemeldet: true, lagerartikel: false });
    expect(meldungsHinweis(ergebnis)).toBe("");

    const [url, optionen] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lager.example.de/shop/webhooks/abc/product");
    const koerper = optionen.body as string;
    expect(JSON.parse(koerper)).toEqual({ sku: "WL-TAP-48", action: "delete", changes: {} });
    expect((optionen.headers as Record<string, string>)["X-Webhook-Signature"]).toBe(
      signiereMeldung(koerper, "s".repeat(40)),
    );
  });

  it("meldet übernommene Änderungen und schweigt bei leerer Änderung", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/shop/webhooks/abc/order";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);
    const fetchMock = vi.fn(async () => Response.json({ sku: "L-1", status: "ok", uebernommen: ["sale_price"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(meldeProduktAenderung("L-1", "update", {})).resolves.toEqual({
      gemeldet: false,
      grund: "keine_aenderung",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const ergebnis = await meldeProduktAenderung("L-1", "update", { priceCents: 1299 });
    expect(ergebnis).toEqual({ gemeldet: true, lagerartikel: true });
    expect(meldungsHinweis(ergebnis)).toContain("Lager übernommen");
  });

  it("warnt, wenn das Lager nicht erreichbar ist", async () => {
    process.env.LAGER_WEBHOOK_URL = "https://lager.example.de/shop/webhooks/abc/order";
    process.env.LAGER_WEBHOOK_SECRET = "s".repeat(40);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const ergebnis = await meldeProduktAenderung("L-1", "deactivate");
    expect(ergebnis).toEqual({ gemeldet: false, grund: "nicht_erreichbar" });
    expect(meldungsHinweis(ergebnis)).toContain("nicht benachrichtigt");
  });
});
