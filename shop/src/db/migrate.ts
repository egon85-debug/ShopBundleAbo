/** Migrationen anwenden: npm run db:migrate */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migrationen erfolgreich angewendet.");
}

main().catch((error) => {
  console.error("Migration fehlgeschlagen:", error);
  process.exit(1);
});
