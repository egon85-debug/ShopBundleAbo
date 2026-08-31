import { describe, expect, it } from "vitest";

import { MIN_SCHLUESSELLAENGE, pruefeIngestSchluessel } from "@/lib/ingest-auth";

const GUELTIG = "x".repeat(MIN_SCHLUESSELLAENGE);

describe("Zugang zur Lager-Schnittstelle", () => {
  it("lässt den richtigen Schlüssel durch", () => {
    expect(pruefeIngestSchluessel(GUELTIG, GUELTIG)).toBe("ok");
  });

  it("weist falsche, fehlende und leere Schlüssel ab", () => {
    expect(pruefeIngestSchluessel("y".repeat(MIN_SCHLUESSELLAENGE), GUELTIG)).toBe("abgelehnt");
    expect(pruefeIngestSchluessel(null, GUELTIG)).toBe("abgelehnt");
    expect(pruefeIngestSchluessel("", GUELTIG)).toBe("abgelehnt");
    expect(pruefeIngestSchluessel(GUELTIG.slice(0, -1), GUELTIG)).toBe("abgelehnt");
  });

  it("bleibt geschlossen, wenn der Server keinen Schlüssel hinterlegt hat", () => {
    // Ein fehlendes Geheimnis darf niemals zu offenem Zugang führen.
    expect(pruefeIngestSchluessel(GUELTIG, undefined)).toBe("nicht_konfiguriert");
    expect(pruefeIngestSchluessel("", undefined)).toBe("nicht_konfiguriert");
    expect(pruefeIngestSchluessel(GUELTIG, "")).toBe("nicht_konfiguriert");
  });

  it("lehnt einen zu kurzen hinterlegten Schlüssel ab, statt ihn zu akzeptieren", () => {
    const kurz = "geheim";
    expect(pruefeIngestSchluessel(kurz, kurz)).toBe("nicht_konfiguriert");
  });
});
