import { describe, expect, it } from "vitest";

import { connectionOptions, usesTransactionPooler } from "@/db";

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

  it("schaltet vorbereitete Anweisungen hinter einem Pooler ab", () => {
    expect(connectionOptions("postgres://u:p@x.pooler.supabase.com:6543/postgres").prepare).toBe(false);
    expect(connectionOptions("postgres://u:p@db.example.com:5432/postgres").prepare).toBe(true);
  });

  it("begrenzt Verbindungsaufbau und Leerlauf, damit Störungen nicht hängen bleiben", () => {
    const options = connectionOptions("postgres://u:p@x.pooler.supabase.com:6543/postgres");
    expect(options.connect_timeout).toBeGreaterThan(0);
    expect(options.connect_timeout).toBeLessThanOrEqual(15);
    // Pooler räumen Verbindungen nach ca. 600 s ab – wir müssen deutlich früher schließen.
    expect(options.idle_timeout).toBeLessThan(600);
    expect(options.max_lifetime).toBeLessThanOrEqual(600);
  });
});
