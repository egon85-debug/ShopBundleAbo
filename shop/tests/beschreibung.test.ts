import { describe, expect, it } from "vitest";

import { beschreibungHtml } from "@/lib/beschreibung";

describe("beschreibungHtml", () => {
  it("lässt Absätze und Listen stehen", () => {
    expect(beschreibungHtml("<p>Cola</p><ul><li>6 × 1,0 l</li></ul>")).toBe("<p>Cola</p><ul><li>6 × 1,0 l</li></ul>");
  });

  it("entfernt Skripte, Attribute und Links", () => {
    const html = beschreibungHtml('<p onclick="x()">Hallo<script>alert(1)</script> <a href="https://x">Link</a></p>');
    expect(html).toBe("<p>Hallo Link</p>");
  });

  it("gibt für Klartext null zurück, damit er mit Zeilenumbrüchen erscheint", () => {
    expect(beschreibungHtml("Zeile 1\nZeile 2 – 3 < 5")).toBeNull();
    expect(beschreibungHtml(null)).toBeNull();
  });
});
