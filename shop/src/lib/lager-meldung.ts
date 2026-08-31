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
