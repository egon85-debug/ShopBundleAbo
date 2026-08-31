import { describe, expect, it } from "vitest";

import { usesTransactionPooler } from "@/db";

describe("Datenbankverbindung", () => {
  it("erkennt Transaction-Pooler an Host, Port und Flag", () => {
    expect(usesTransactionPooler("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(usesTransactionPooler("postgres://u:p@db.example.com:6543/postgres")).toBe(true);
    expect(usesTransactionPooler("postgres://u:p@db.example.com:5432/postgres?pgbouncer=true")).toBe(true);
  });

  it("erkennt direkte Verbindungen korrekt als nicht gepoolt", () => {
    expect(usesTransactionPooler("postgres://u:p@db.example.com:5432/postgres")).toBe(false);
    expect(usesTransactionPooler("postgres://u:p@localhost:5432/winterfeld_shop")).toBe(false);
  });
});
