import { timingSafeEqual } from "node:crypto";

/**
 * Ergebnis der Schluesselpruefung fuer die Lager-Schnittstelle.
 *
 * - `nicht_konfiguriert`: Der Server hat keinen (oder einen zu kurzen)
 *   Schluessel hinterlegt. Die Schnittstelle ist dann geschlossen – ein
 *   fehlendes Geheimnis darf niemals zu offenem Zugang fuehren.
 * - `abgelehnt`: Es wurde ein falscher oder kein Schluessel vorgelegt.
 */
export type SchluesselPruefung = "ok" | "nicht_konfiguriert" | "abgelehnt";

/** Mindestlaenge, damit ein geratener oder versehentlich leerer Wert nicht traegt. */
export const MIN_SCHLUESSELLAENGE = 32;

/**
 * Vergleicht den vorgelegten Schluessel mit dem hinterlegten – in konstanter
 * Zeit, damit sich der richtige Wert nicht ueber Antwortzeiten erraten laesst.
 */
export function pruefeIngestSchluessel(
  vorgelegt: string | null | undefined,
  erwartet: string | undefined,
): SchluesselPruefung {
  if (!erwartet || erwartet.length < MIN_SCHLUESSELLAENGE) return "nicht_konfiguriert";
  if (!vorgelegt) return "abgelehnt";

  const a = Buffer.from(vorgelegt, "utf8");
  const b = Buffer.from(erwartet, "utf8");
  // timingSafeEqual verlangt gleiche Laenge; die Laenge selbst ist kein Geheimnis.
  if (a.length !== b.length) return "abgelehnt";
  return timingSafeEqual(a, b) ? "ok" : "abgelehnt";
}
