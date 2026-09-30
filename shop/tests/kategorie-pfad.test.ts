import { describe, expect, it } from "vitest";

import { kategoriePfad } from "@/services/ingest";

describe("kategoriePfad", () => {
  it("teilt „A > B > C“ aus dem Lager in einzelne Ebenen", () => {
    // Gemeldet: Diese Kategorie stand mit vollem Pfad als Name in der Kopfzeile.
    expect(kategoriePfad("Getränke > Alkoholfreie Getränke > Cola/Limonade")).toEqual([
      "Getränke",
      "Alkoholfreie Getränke",
      "Cola/Limonade",
    ]);
    expect(kategoriePfad("Werkzeug › Akkuschrauber")).toEqual(["Werkzeug", "Akkuschrauber"]);
  });

  it("lässt Namen ohne Pfad unverändert – auch mit Schrägstrich oder Komma", () => {
    expect(kategoriePfad("FPV-Videobrille / Goggles")).toEqual(["FPV-Videobrille / Goggles"]);
    expect(kategoriePfad("Brettspiel, Familienspiel")).toEqual(["Brettspiel, Familienspiel"]);
    expect(kategoriePfad("  Verpackung ")).toEqual(["Verpackung"]);
  });
});
