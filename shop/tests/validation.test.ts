import { describe, expect, it } from "vitest";

import { addressSchema, checkoutSchema, passwortAendernSchema, productSchema, slugify } from "@/lib/validation";

const address = {
  firstName: "Erika",
  lastName: "Musterfrau",
  street: "Hauptstraße",
  houseNumber: "12a",
  zip: "10115",
  city: "Berlin",
  country: "de",
};

describe("Validierung", () => {
  it("normalisiert den Ländercode auf Großbuchstaben", () => {
    const parsed = addressSchema.parse(address);
    expect(parsed.country).toBe("DE");
  });

  it("verlangt Pflichtfelder in der Adresse", () => {
    expect(addressSchema.safeParse({ ...address, zip: "" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...address, country: "Deutschland" }).success).toBe(false);
  });

  it("erzwingt AGB-Zustimmung im Checkout", () => {
    const base = {
      email: "kunde@example.de",
      shippingAddress: address,
      shippingMethod: "dhl_paket" as const,
      billingSameAsShipping: true,
      createAccount: false,
    };
    expect(checkoutSchema.safeParse({ ...base, acceptsTerms: false }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, acceptsTerms: true }).success).toBe(true);
  });

  it("akzeptiert nur bekannte Versandarten", () => {
    const result = checkoutSchema.safeParse({
      email: "kunde@example.de",
      shippingAddress: address,
      shippingMethod: "hermes",
      acceptsTerms: true,
    });
    expect(result.success).toBe(false);
  });

  it("weist unsaubere Slugs im Produktschema zurück", () => {
    const base = {
      sku: "WL-1", name: "Test", priceCents: 1000, taxRate: 19, weightGrams: 100,
      isActive: true, isFeatured: false,
    };
    expect(productSchema.safeParse({ ...base, slug: "Mein Produkt" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, slug: "mein-produkt" }).success).toBe(true);
  });

  it("baut Slugs mit deutschen Umlauten korrekt", () => {
    expect(slugify("Größere Kartonage")).toBe("groessere-kartonage");
    expect(slugify("Paket & Versand!")).toBe("paket-versand");
  });
});

describe("Passwort ändern (Adminbereich)", () => {
  const gueltig = { aktuell: "alt-passwort", neu: "ein-neues-langes-pw", wiederholung: "ein-neues-langes-pw" };

  it("nimmt ein gültiges neues Passwort an", () => {
    expect(passwortAendernSchema.safeParse(gueltig).success).toBe(true);
  });

  it("verlangt mindestens 12 Zeichen", () => {
    const ergebnis = passwortAendernSchema.safeParse({ ...gueltig, neu: "kurz", wiederholung: "kurz" });
    expect(ergebnis.success).toBe(false);
  });

  it("verlangt zweimal dasselbe neue Passwort", () => {
    const ergebnis = passwortAendernSchema.safeParse({ ...gueltig, wiederholung: "etwas-anderes-pw" });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain("stimmen nicht überein");
  });

  it("lehnt das bisherige Passwort als neues ab", () => {
    const gleich = "gleiches-passwort-123";
    const ergebnis = passwortAendernSchema.safeParse({ aktuell: gleich, neu: gleich, wiederholung: gleich });
    expect(ergebnis.success).toBe(false);
  });
});
