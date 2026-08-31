import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { meldeVerkauf, meldungKonfiguriert, signiereMeldung } from "@/lib/lager-meldung";

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
    const [url, optionen] = fetchMock.mock.calls[0] as [string, RequestInit];
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
