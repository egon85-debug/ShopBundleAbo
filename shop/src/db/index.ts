import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof createClient>;

declare global {
  // eslint-disable-next-line no-var
  var __winterfeldDb: Database | undefined;
}

/**
 * Transaction-Pooler (z. B. Supabase auf Port 6543, PgBouncer) geben pro
 * Anweisung eine andere Serververbindung heraus. Vorbereitete Anweisungen
 * ueberleben das nicht ("prepared statement does not exist"), deshalb werden
 * sie fuer solche Verbindungen abgeschaltet.
 */
export function usesTransactionPooler(url: string): boolean {
  return /pooler\./i.test(url) || /:6543\b/.test(url) || /[?&]pgbouncer=true/i.test(url);
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe shop/.env.example)");

  const pooled = usesTransactionPooler(url);
  const client = postgres(url, {
    // Serverless-Instanzen halten je nur wenige Verbindungen; hinter einem
    // Pooler genuegt eine pro Instanz. Im Dev-Modus eine, damit Hot Reload
    // keine Verbindungen leakt.
    max: process.env.NODE_ENV === "production" ? (pooled ? 1 : 10) : 1,
    prepare: !pooled,
  });
  return drizzle(client, { schema });
}

function getDb(): Database {
  if (!globalThis.__winterfeldDb) {
    globalThis.__winterfeldDb = createClient();
  }
  return globalThis.__winterfeldDb;
}

/**
 * Die Verbindung wird erst beim ersten Zugriff aufgebaut, nicht beim Import.
 * So laesst sich die Anwendung bauen und ausliefern, ohne dass zur Bauzeit eine
 * Datenbank erreichbar sein muss – erst eine echte Abfrage benoetigt DATABASE_URL.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

export { schema };
