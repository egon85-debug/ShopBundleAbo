import { describe, expect, it } from "vitest";

import { formatCents, parseToCents, taxFromGross } from "@/lib/money";

describe("Geldbeträge", () => {
  it("parst deutsche und englische Schreibweise", () => {
    expect(parseToCents("29,90")).toBe(2990);
    expect(parseToCents("29.90")).toBe(2990);
    expect(parseToCents("1.234,56")).toBe(123456);
    expect(parseToCents("59,90 €")).toBe(5990);
  });

  it("weist ungültige und negative Eingaben zurück", () => {
    expect(parseToCents("teuer")).toBeNull();
    expect(parseToCents("-5")).toBeNull();
    expect(parseToCents("")).toBeNull();
    expect(parseToCents(null)).toBeNull();
  });

  it("rechnet Zahlen ohne Float-Rundungsfehler", () => {
    expect(parseToCents(0.1 + 0.2)).toBe(30);
    expect(parseToCents(19.99)).toBe(1999);
  });

  it("formatiert als Euro-Betrag", () => {
    expect(formatCents(2990)).toContain("29,90");
  });

  it("errechnet die enthaltene Mehrwertsteuer aus dem Bruttopreis", () => {
    // 119,00 € brutto bei 19 % → 19,00 € Steueranteil
    expect(taxFromGross(11900, 19)).toBe(1900);
    expect(taxFromGross(10700, 7)).toBe(700);
    expect(taxFromGross(0, 19)).toBe(0);
  });
});
