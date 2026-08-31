import { NextResponse } from "next/server";

import { getCart } from "@/services/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Anzahl der Artikel im Warenkorb des aktuellen Besuchers.
 *
 * Der Zaehler wird bewusst nicht in der Seite selbst gerendert: Er haengt an
 * einem Cookie und wuerde jede Seite des Shops von der statischen Auslieferung
 * ausschliessen. Als eigener Aufruf bleiben Start-, Kategorie- und
 * Produktseiten zwischenspeicherbar und damit auch dann erreichbar, wenn die
 * Datenbank gerade langsam antwortet.
 */
export async function GET() {
  try {
    const cart = await getCart();
    return NextResponse.json(
      { anzahl: cart?.itemCount ?? 0 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // Ein Fehler beim Zaehler darf die Kopfzeile nicht beschaedigen.
    return NextResponse.json({ anzahl: 0 }, { headers: { "cache-control": "no-store" } });
  }
}
