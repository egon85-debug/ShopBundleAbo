/**
 * Geldbeträge werden ausschließlich als Integer in Cent geführt.
 * Formatierung immer über diese Helfer – nie ad hoc mit toFixed().
 */

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

/** "29,90" | "29.90" | "29,90 €" → 2990 (Cent). Ungültige Eingabe → null. */
export function parseToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[€\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Enthaltene Mehrwertsteuer aus einem Bruttobetrag (Preise im Shop sind brutto).
 * 11900 Cent bei 19 % → 1900 Cent.
 */
export function taxFromGross(grossCents: number, taxRatePercent: number): number {
  return Math.round(grossCents - grossCents / (1 + taxRatePercent / 100));
}
