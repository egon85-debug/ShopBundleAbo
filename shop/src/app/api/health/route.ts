import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { kategorisiereFehler } from "@/lib/db-diagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Betriebs-Endpunkt: meldet, ob die Anwendung ihre Datenbank erreicht.
 *
 * Die Antwort nennt bewusst nur eine grobe Ursachenkategorie und niemals die
 * Verbindungszeichenfolge, Zugangsdaten oder Hostnamen – sie ist oeffentlich
 * abrufbar und darf keine Infrastrukturdetails preisgeben.
 */
export async function GET() {
  const beginn = Date.now();

  try {
    const [zeile] = await db.execute<{ produkte: number; kategorien: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM products)   AS produkte,
        (SELECT count(*)::int FROM categories) AS kategorien
    `);

    return NextResponse.json(
      {
        status: "ok",
        datenbank: {
          ursache: "ok",
          antwortzeit_ms: Date.now() - beginn,
          produkte: Number(zeile?.produkte ?? 0),
          kategorien: Number(zeile?.kategorien ?? 0),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (fehler) {
    const { ursache, hinweis } = kategorisiereFehler(fehler);
    // Vollstaendiger Fehler nur ins Server-Log, nicht in die Antwort.
    console.error("[health] Datenbankpruefung fehlgeschlagen:", fehler);

    return NextResponse.json(
      {
        status: "fehler",
        datenbank: { ursache, hinweis, antwortzeit_ms: Date.now() - beginn },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
