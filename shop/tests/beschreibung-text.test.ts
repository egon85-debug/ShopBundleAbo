import { describe, expect, it } from "vitest";

import { beschreibungAusFeld, htmlZuText, textZuHtml } from "@/lib/beschreibung-text";

// Beschreibung, wie sie die KI im Lager erzeugt (gemeldet: Tags im Eingabefeld).
const FEBREZE =
  "<p>Der Lufterfrischer Morgentau von Febreze erfrischt Ihre Raumluft schnell und zuverlässig. " +
  "Das Produkt von Procter & Gamble ist eine praktische Lösung für jeden Raum.</p>" +
  "<p>Produktdetails:</p><ul><li>Hersteller: Procter & Gamble</li><li>Marke: Febreze</li>" +
  "<li>Variante: Morgentau</li><li>EAN: 8006530212922</li></ul>";

describe("htmlZuText", () => {
  it("zeigt Absätze und Aufzählungen ohne Tags", () => {
    const text = htmlZuText(FEBREZE);
    expect(text).not.toMatch(/<[a-z/]/i);
    expect(text).toBe(
      "Der Lufterfrischer Morgentau von Febreze erfrischt Ihre Raumluft schnell und zuverlässig. " +
        "Das Produkt von Procter & Gamble ist eine praktische Lösung für jeden Raum.\n\n" +
        "Produktdetails:\n\n• Hersteller: Procter & Gamble\n• Marke: Febreze\n• Variante: Morgentau\n" +
        "• EAN: 8006530212922",
    );
  });

  it("wandelt Zeichen wie &amp; zurück und lässt Klartext unverändert", () => {
    expect(htmlZuText("<p>A&amp;B&nbsp;C<br>neu</p>")).toBe("A&B C\nneu");
    expect(htmlZuText("Zeile 1\nZeile 2")).toBe("Zeile 1\nZeile 2");
    expect(htmlZuText(null)).toBe("");
  });
});

describe("textZuHtml", () => {
  it("macht aus Absätzen <p> und aus Spiegelstrichen eine Liste", () => {
    expect(textZuHtml("Satz eins\nZeile zwei\n\nListe:\n- a <b>\n• b & c")).toBe(
      "<p>Satz eins<br>Zeile zwei</p><p>Liste:</p><ul><li>a &lt;b&gt;</li><li>b &amp; c</li></ul>",
    );
  });

  it("übersteht den Weg hin und zurück", () => {
    const text = htmlZuText(FEBREZE);
    expect(htmlZuText(textZuHtml(text))).toBe(text);
  });
});

describe("beschreibungAusFeld", () => {
  it("lässt eine unveränderte HTML-Beschreibung wörtlich stehen", () => {
    expect(beschreibungAusFeld(htmlZuText(FEBREZE), FEBREZE)).toBe(FEBREZE);
  });

  it("speichert geänderten Text wieder als HTML", () => {
    const neu = beschreibungAusFeld(htmlZuText(FEBREZE).replace("Morgentau\n", "Frühlingsduft\n"), FEBREZE);
    expect(neu).toContain("<li>Variante: Frühlingsduft</li>");
  });

  it("lässt Klartext Klartext und leere Felder leer", () => {
    expect(beschreibungAusFeld("nur Text", "alter Text")).toBe("nur Text");
    expect(beschreibungAusFeld("nur Text", null)).toBe("nur Text");
    expect(beschreibungAusFeld("  ", FEBREZE)).toBeNull();
  });
});
