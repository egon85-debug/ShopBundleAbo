import { describe, expect, it } from "vitest";

import { fuellmengeText, grundpreis, grundpreisText, pfandText } from "@/lib/grundpreis";

const cola = { netContentAmount: 1000, netContentUnit: "ml", unitsPerPack: 6, depositCents: 150, depositType: "einweg" };

describe("Grundpreis und Pfand", () => {
  it("rechnet über alle Einheiten im Gebinde je Liter", () => {
    expect(grundpreis(1194, cola)).toEqual({ cents: 199, je: "l" });
    expect(grundpreisText(1194, cola)).toMatch(/^1,99\s€\/l$/);
  });

  it("rechnet Gramm je Kilogramm", () => {
    expect(grundpreis(349, { netContentAmount: 250, netContentUnit: "g", unitsPerPack: null })).toEqual({ cents: 1396, je: "kg" });
  });

  it("ohne Füllmenge kein Grundpreis", () => {
    expect(grundpreis(999, { netContentAmount: null, netContentUnit: null, unitsPerPack: null })).toBeNull();
  });

  it("Pfand und Füllmenge lesbar", () => {
    expect(pfandText(cola)).toMatch(/^zzgl\. 1,50\s€ Pfand \(Einweg\)$/);
    expect(pfandText({ ...cola, depositCents: 0 })).toBeNull();
    expect(fuellmengeText(cola)).toBe("6 × 1 l");
    expect(fuellmengeText({ netContentAmount: 330, netContentUnit: "ml", unitsPerPack: 1 })).toBe("330 ml");
    expect(fuellmengeText({ netContentAmount: 1500, netContentUnit: "ml", unitsPerPack: 1 })).toBe("1,5 l");
  });
});

import { lebensmittelWerte } from "@/services/ingest";
import { ingestArtikelSchema } from "@/services/ingest";

describe("Übernahme der Lebensmittelangaben", () => {
  it("setzt mitgeschickte Werte und leert mit null", () => {
    const voll = ingestArtikelSchema.parse({
      sku: "WL-1", inhalt: { menge: 1000, einheit: "ml", anzahl: 6 }, pfandCents: 150,
      pfandArt: "einweg", zutaten: " Wasser, Zucker ", allergene: "", lebensmittelHinweise: null,
    });
    expect(lebensmittelWerte(voll)).toEqual({
      netContentAmount: 1000, netContentUnit: "ml", unitsPerPack: 6, depositCents: 150,
      depositType: "einweg", ingredients: "Wasser, Zucker", allergens: null, foodNotes: null,
    });
    const leer = ingestArtikelSchema.parse({ sku: "WL-1", inhalt: null, pfandCents: 0, pfandArt: null });
    expect(lebensmittelWerte(leer)).toEqual({
      netContentAmount: null, netContentUnit: null, unitsPerPack: null, depositCents: 0, depositType: null,
    });
  });

  it("lässt nicht mitgeschickte Angaben unberührt", () => {
    expect(lebensmittelWerte(ingestArtikelSchema.parse({ sku: "WL-1" }))).toEqual({});
  });

  it("lehnt unbekannte Einheiten ab", () => {
    expect(ingestArtikelSchema.safeParse({ sku: "WL-1", inhalt: { menge: 1, einheit: "l" } }).success).toBe(false);
  });
});
