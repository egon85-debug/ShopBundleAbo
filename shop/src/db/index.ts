import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof createClient>;

declare global {
  // eslint-disable-next-line no-var
  var __winterfeldDb: Database | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe shop/.env.example)");
  // max: 1 im Dev-Modus, damit Hot Reload keine Verbindungen leakt.
  const client = postgres(url, { max: process.env.NODE_ENV === "production" ? 10 : 1 });
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
 * So lässt sich die Anwendung bauen und ausliefern, ohne dass zur Bauzeit eine
 * Datenbank erreichbar sein muss – erst eine echte Abfrage benötigt DATABASE_URL.
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
