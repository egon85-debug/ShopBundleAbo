import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { pruefeIngestSchluessel } from "@/lib/ingest-auth";
import { IngestFehler, ingestArtikelSchema, uebernehmeArtikel } from "@/services/ingest";
import { KATEGORIE_TAG } from "@/services/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Schnittstelle der Lagererfassung: ein Artikel wird angelegt oder aktualisiert.
 *
 * Zugang ausschliesslich ueber den Kopfzeilenschluessel `x-api-key`, der als
 * Umgebungsvariable INGEST_API_KEY hinterlegt ist – nicht ueber den
 * Admin-Login, damit ein Maschinenzugang nie Sitzungsrechte im Backoffice hat.
 * Ist kein Schluessel hinterlegt, bleibt die Schnittstelle geschlossen.
 */
export async function POST(request: Request) {
  const pruefung = pruefeIngestSchluessel(
    request.headers.get("x-api-key"),
    process.env.INGEST_API_KEY,
  );
  if (pruefung === "nicht_konfiguriert") {
    return NextResponse.json(
      { fehler: "Schnittstelle nicht eingerichtet (INGEST_API_KEY fehlt)." },
      { status: 503 },
    );
  }
  if (pruefung === "abgelehnt") {
    return NextResponse.json({ fehler: "Zugang verweigert." }, { status: 401 });
  }

  let rohdaten: unknown;
  try {
    rohdaten = await request.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültiges JSON." }, { status: 400 });
  }

  const geprueft = ingestArtikelSchema.safeParse(rohdaten);
  if (!geprueft.success) {
    return NextResponse.json(
      {
        fehler: "Artikeldaten unvollständig oder fehlerhaft.",
        felder: geprueft.error.issues.map((issue) => ({
          feld: issue.path.join("."),
          grund: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const ergebnis = await uebernehmeArtikel(geprueft.data);

    // Zwischenspeicher der betroffenen Seiten erneuern, damit der Artikel
    // sofort sichtbar ist und nicht erst nach Ablauf der Frist.
    revalidatePath(ergebnis.pfad);
    revalidatePath("/shop");
    revalidatePath("/");
    revalidateTag(KATEGORIE_TAG);

    const basis = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
    return NextResponse.json(
      { ...ergebnis, url: basis ? `${basis}${ergebnis.pfad}` : ergebnis.pfad },
      { status: ergebnis.angelegt ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof IngestFehler) {
      return NextResponse.json({ fehler: error.message }, { status: 422 });
    }
    // Interne Fehler nur im Serverprotokoll, nie in der Antwort.
    console.error("[ingest] Übernahme fehlgeschlagen:", error);
    return NextResponse.json({ fehler: "Übernahme fehlgeschlagen." }, { status: 500 });
  }
}
