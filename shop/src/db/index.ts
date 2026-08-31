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

/**
 * Verbindungsoptionen. Die Zeitlimits sind der Grund, weshalb eine kurzzeitige
 * Stoerung nicht mehr als haengende Seite beim Kunden ankommt:
 *
 * - `connect_timeout`  bricht einen Verbindungsaufbau ab, statt bis zum
 *   Funktions-Zeitlimit zu warten. Die Seite zeigt dann ihre Ersatzinhalte.
 * - `idle_timeout`     schliesst ungenutzte Verbindungen von sich aus. Pooler
 *   raeumen ihrerseits nach ca. 10 Minuten auf; eine serverlose Instanz, die
 *   danach wieder aufwacht, wuerde sonst auf einen bereits geschlossenen Socket
 *   schreiben und den ersten Aufruf verlieren.
 * - `max_lifetime`     erneuert langlebige Verbindungen regelmaessig.
 */
export function connectionOptions(url: string) {
  const pooled = usesTransactionPooler(url);
  return {
    // Serverless-Instanzen halten je nur wenige Verbindungen; hinter einem
    // Pooler genuegt eine pro Instanz. Im Dev-Modus eine, damit Hot Reload
    // keine Verbindungen leakt.
    max: process.env.NODE_ENV === "production" ? (pooled ? 1 : 10) : 1,
    prepare: !pooled,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 10,
  } satisfies postgres.Options<Record<string, never>>;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe shop/.env.example)");

  return drizzle(postgres(url, connectionOptions(url)), { schema });
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
