import { describe, expect, it } from "vitest";

/**
 * Die Kategorisierung wird hier ueber dieselbe Logik geprueft wie im Endpunkt.
 * Wichtig ist vor allem, dass nie Zugangsdaten in der Antwort landen.
 */
import { kategorisiereFehler } from "@/lib/db-diagnose";

describe("Datenbank-Fehlerdiagnose", () => {
  it("erkennt fehlende Konfiguration", () => {
    const e = new Error("DATABASE_URL ist nicht gesetzt (siehe shop/.env.example)");
    expect(kategorisiereFehler(e).ursache).toBe("keine_konfiguration");
  });

  it("erkennt abgelehnte Anmeldung", () => {
    const e = Object.assign(new Error("password authentication failed for user"), { code: "28P01" });
    expect(kategorisiereFehler(e).ursache).toBe("anmeldung_abgelehnt");
  });

  it("erkennt nicht erreichbaren Host", () => {
    const e = Object.assign(new Error("getaddrinfo ENOTFOUND db.example.com"), { code: "ENOTFOUND" });
    expect(kategorisiereFehler(e).ursache).toBe("nicht_erreichbar");
    const t = Object.assign(new Error("write CONNECT_TIMEOUT pooler:6543"), {});
    expect(kategorisiereFehler(t).ursache).toBe("nicht_erreichbar");
  });

  it("erkennt fehlendes Schema", () => {
    const e = Object.assign(new Error('relation "products" does not exist'), { code: "42P01" });
    expect(kategorisiereFehler(e).ursache).toBe("schema_fehlt");
  });

  it("erkennt fehlende Rechte", () => {
    const e = Object.assign(new Error("permission denied for table products"), { code: "42501" });
    expect(kategorisiereFehler(e).ursache).toBe("anmeldung_abgelehnt");
  });

  it("gibt niemals die Fehlermeldung selbst preis", () => {
    const geheim = new Error("connect failed: postgresql://user:GEHEIM@host/db");
    const ergebnis = kategorisiereFehler(geheim);
    expect(JSON.stringify(ergebnis)).not.toContain("GEHEIM");
    expect(JSON.stringify(ergebnis)).not.toContain("postgresql://");
  });
});
