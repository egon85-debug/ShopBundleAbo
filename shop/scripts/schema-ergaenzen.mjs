/**
 * Fehlende Spalten beim Build ergänzen: `npm run build` ruft das vor `next build` auf.
 *
 * Die Produktionsdatenbank wurde einmal von Hand eingerichtet; spätere
 * Schemaänderungen müsste sonst jemand dort nachziehen. Die Befehle hier sind
 * rein ergänzend und wiederholbar (ADD COLUMN IF NOT EXISTS) – ein zweiter
 * Lauf ändert nichts. Ohne DATABASE_URL (Vorschau, lokal) passiert nichts.
 *
 * Schlägt das Ergänzen fehl, bricht der Build ab: Der neue Code würde die
 * Spalten sofort abfragen, die alte Veröffentlichung bleibt dann online.
 *
 * Die CI baut mit einer Schein-DATABASE_URL ohne Datenbank und setzt dafür
 * SCHEMA_ERGAENZEN=aus.
 *
 * Bewusst reines JavaScript für `node`: tsx braucht esbuild, dessen
 * Installationsskript neuere npm-Versionen (Vercel) nicht mehr ausführen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

const DATEIEN = ["0001_lebensmittelangaben.sql"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (process.env.SCHEMA_ERGAENZEN === "aus") {
    console.log("[schema] SCHEMA_ERGAENZEN=aus – Schema-Ergänzung übersprungen.");
    return;
  }
  if (!url) {
    console.log("[schema] Keine DATABASE_URL – Schema-Ergänzung übersprungen.");
    return;
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    for (const datei of DATEIEN) {
      const inhalt = readFileSync(path.join(process.cwd(), "drizzle", datei), "utf8");
      for (const befehl of inhalt.split("--> statement-breakpoint").map((b) => b.trim()).filter(Boolean)) {
        await sql.unsafe(befehl);
      }
      console.log(`[schema] ${datei}: angewendet (bzw. schon vorhanden).`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((fehler) => {
  console.error("[schema] Ergänzung fehlgeschlagen:", fehler);
  process.exit(1);
});
