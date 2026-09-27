import "server-only";

import { createHmac } from "node:crypto";

/**
 * Meldung eines Verkaufs an die Lagererfassung.
 *
 * Das Lager fuehrt den echten Bestand. Verkauft der Shop einen Artikel, muss
 * das dort als Bewegung ankommen – sonst laufen die beiden Bestaende
 * auseinander. Die Nachricht ist mit HMAC-SHA256 signiert, damit das Lager
 * fremde Aufrufe abweisen kann.
 *
 * Die Meldung darf den Zahlungsvorgang niemals scheitern lassen: schlaegt sie
 * fehl, wird das protokolliert und die Bestellung trotzdem abgeschlossen.
 */
export type Verkaufsposition = { sku: string; quantity: number };

export function signiereMeldung(koerper: string, geheimnis: string): string {
  return createHmac("sha256", geheimnis).update(koerper).digest("hex");
}

/** Ist die Rueckmeldung eingerichtet? Ohne beide Werte passiert nichts. */
export function meldungKonfiguriert(
  url = process.env.LAGER_WEBHOOK_URL,
  geheimnis = process.env.LAGER_WEBHOOK_SECRET,
): boolean {
  return Boolean(url && geheimnis);
}

export async function meldeVerkauf(
  bestellnummer: string,
  positionen: Verkaufsposition[],
): Promise<{ gemeldet: boolean; grund?: string }> {
  const url = process.env.LAGER_WEBHOOK_URL;
  const geheimnis = process.env.LAGER_WEBHOOK_SECRET;
  if (!url || !geheimnis) return { gemeldet: false, grund: "nicht_konfiguriert" };

  const verwertbar = positionen.filter((p) => p.sku && p.quantity > 0);
  if (verwertbar.length === 0) return { gemeldet: false, grund: "keine_positionen" };

  const koerper = JSON.stringify({ order_id: bestellnummer, items: verwertbar });

  try {
    const antwort = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Webhook-Signature": signiereMeldung(koerper, geheimnis),
      },
      body: koerper,
      signal: AbortSignal.timeout(15_000),
    });
    if (!antwort.ok) {
      console.error(`[lager] Verkaufsmeldung abgelehnt: HTTP ${antwort.status}`);
      return { gemeldet: false, grund: `http_${antwort.status}` };
    }
    return { gemeldet: true };
  } catch (fehler) {
    console.error("[lager] Verkaufsmeldung fehlgeschlagen:", fehler);
    return { gemeldet: false, grund: "nicht_erreichbar" };
  }
}

/* ───────────── Änderungen aus dem Shop-Admin ───────────── */

/**
 * Felder, die das Lager aus dem Shop-Admin übernimmt. Bestand und Bilder
 * gehören nicht dazu: den Bestand führt das Lager selbst.
 */
export const LAGER_FELDER = [
  "name",
  "priceCents",
  "shortDescription",
  "description",
  "seoTitle",
  "seoDescription",
] as const;
export type LagerFeld = (typeof LAGER_FELDER)[number];
export type Produktaenderung = Partial<Record<LagerFeld, string | number | null>>;
export type Produktaktion = "update" | "activate" | "deactivate" | "delete";

export type ProduktMeldung =
  | { gemeldet: true; lagerartikel: boolean }
  | { gemeldet: false; grund: string };

/** Die Produktadresse liegt neben der Bestelladresse: …/{id}/order → …/{id}/product. */
export function produktAdresse(url: string): string | null {
  return /\/order\/?$/.test(url) ? url.replace(/\/order\/?$/, "/product") : null;
}

/** Nur die geänderten Lagerfelder aus altem und neuem Stand. */
export function lagerAenderungen(
  alt: Partial<Record<LagerFeld, unknown>>,
  neu: Partial<Record<LagerFeld, unknown>>,
): Produktaenderung {
  const aenderungen: Produktaenderung = {};
  for (const feld of LAGER_FELDER) {
    const vorher = alt[feld] ?? null;
    const nachher = neu[feld] ?? null;
    if (vorher !== nachher) aenderungen[feld] = nachher as string | number | null;
  }
  return aenderungen;
}

/**
 * Meldet eine Änderung im Shop-Admin ans Lager, damit die nächste
 * Veröffentlichung von dort sie nicht überschreibt. Artikel, die das Lager
 * nicht kennt (z. B. Musterartikel), quittiert es als „unknown_sku“.
 * Wirft nie – das Speichern im Shop gilt unabhängig davon.
 */
export async function meldeProduktAenderung(
  sku: string,
  aktion: Produktaktion,
  aenderungen: Produktaenderung = {},
): Promise<ProduktMeldung> {
  const basis = process.env.LAGER_WEBHOOK_URL;
  const geheimnis = process.env.LAGER_WEBHOOK_SECRET;
  if (!basis || !geheimnis) return { gemeldet: false, grund: "nicht_konfiguriert" };
  const url = produktAdresse(basis);
  if (!url) return { gemeldet: false, grund: "adresse_unbekannt" };
  if (!sku) return { gemeldet: false, grund: "keine_sku" };
  if (aktion === "update" && Object.keys(aenderungen).length === 0) {
    return { gemeldet: false, grund: "keine_aenderung" };
  }

  const koerper = JSON.stringify({ sku, action: aktion, changes: aenderungen });
  try {
    const antwort = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Webhook-Signature": signiereMeldung(koerper, geheimnis),
      },
      body: koerper,
      signal: AbortSignal.timeout(15_000),
    });
    if (!antwort.ok) {
      console.error(`[lager] Produktmeldung abgelehnt: HTTP ${antwort.status}`);
      return { gemeldet: false, grund: `http_${antwort.status}` };
    }
    const daten = (await antwort.json().catch(() => ({}))) as { status?: string };
    return { gemeldet: true, lagerartikel: daten.status !== "unknown_sku" };
  } catch (fehler) {
    console.error("[lager] Produktmeldung fehlgeschlagen:", fehler);
    return { gemeldet: false, grund: "nicht_erreichbar" };
  }
}

/** Kurzer Hinweis für die Admin-Meldung nach dem Speichern. */
export function meldungsHinweis(meldung: ProduktMeldung): string {
  if (meldung.gemeldet) return meldung.lagerartikel ? " Im Lager übernommen." : "";
  if (meldung.grund === "nicht_konfiguriert" || meldung.grund === "keine_aenderung") return "";
  return " Achtung: Das Lager konnte nicht benachrichtigt werden – bitte die Änderung dort ebenfalls eintragen.";
}
