import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __winterfeldDb: ReturnType<typeof createClient> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe shop/.env.example)");
  // max: 1 im Dev-Modus, damit Hot Reload keine Verbindungen leakt.
  const client = postgres(url, { max: process.env.NODE_ENV === "production" ? 10 : 1 });
  return drizzle(client, { schema });
}

export const db = globalThis.__winterfeldDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__winterfeldDb = db;

export { schema };
