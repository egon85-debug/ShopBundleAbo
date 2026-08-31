import { describe, expect, it } from "vitest";

import { formFuerKategorie } from "@/components/three/kategorie-form";

describe("Räumliche Form je Kategorie", () => {
  it("ordnet Lagerkategorien die Transportbox zu", () => {
    expect(formFuerKategorie("Lagertechnik")).toBe("box");
    expect(formFuerKategorie("Transportboxen")).toBe("box");
    expect(formFuerKategorie("Regalsysteme")).toBe("box");
    expect(formFuerKategorie("Stapelbehälter")).toBe("box");
  });

  it("ordnet Versandzubehör die Zubehörkomposition zu", () => {
    expect(formFuerKategorie("Versandzubehör")).toBe("zubehoer");
    expect(formFuerKategorie("Versandetiketten")).toBe("zubehoer");
  });

  it("nimmt für alles Übrige den Karton", () => {
    expect(formFuerKategorie("Verpackung")).toBe("karton");
    expect(formFuerKategorie("Faltkartons")).toBe("karton");
    expect(formFuerKategorie("Etwas ganz Neues")).toBe("karton");
  });

  it("unterscheidet nicht nach Groß- und Kleinschreibung", () => {
    expect(formFuerKategorie("LAGERTECHNIK")).toBe("box");
    expect(formFuerKategorie("versandzubehör")).toBe("zubehoer");
  });
});
