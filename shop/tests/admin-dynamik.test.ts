import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Backoffice-Seiten dürfen niemals beim Build vorab erzeugt werden.
 *
 * Sie zeigen den aktuellen Stand hinter einer Anmeldung — und ein Vorrendern
 * macht den Build von der Erreichbarkeit der Datenbank abhängig. Genau daran
 * ist ein Deployment gescheitert: /admin/produkte/neu war die einzige Seite
 * ohne diese Festlegung.
 */
const ADMIN = path.join(process.cwd(), "src/app/admin");

async function alleSeiten(verzeichnis: string): Promise<string[]> {
  const eintraege = await readdir(verzeichnis, { withFileTypes: true });
  const gefunden: string[] = [];
  for (const eintrag of eintraege) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...(await alleSeiten(voll)));
    else if (eintrag.name === "page.tsx") gefunden.push(voll);
  }
  return gefunden;
}

const FESTLEGUNG = /export const dynamic = "force-dynamic"/;

describe("Backoffice wird nie vorab erzeugt", () => {
  it("das Layout legt es für den ganzen Bereich fest", () => {
    const layout = readFileSync(path.join(ADMIN, "layout.tsx"), "utf8");
    expect(layout).toMatch(FESTLEGUNG);
  });

  it("keine Backoffice-Seite liest die Datenbank ohne diese Festlegung", async () => {
    const seiten = await alleSeiten(ADMIN);
    expect(seiten.length).toBeGreaterThan(5);

    const fehlend = seiten.filter((datei) => {
      const inhalt = readFileSync(datei, "utf8");
      const liestDatenbank = /from "@\/db"|db\.select|db\.query/.test(inhalt);
      return liestDatenbank && !FESTLEGUNG.test(inhalt);
    });

    expect(fehlend.map((d) => path.relative(process.cwd(), d))).toEqual([]);
  });
});
