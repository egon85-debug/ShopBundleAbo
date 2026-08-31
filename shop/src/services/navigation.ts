import "server-only";

import { unstable_cache } from "next/cache";

import { getCategoryTree, type CategoryNode } from "./catalog";

/** Cache-Marke, ueber die Kategorieaenderungen im Backoffice die Navigation erneuern. */
export const KATEGORIE_TAG = "kategorien";

/**
 * Kopf- und Fusszeile brauchen den Kategoriebaum auf jeder Seite. Ohne Cache
 * waeren das zwei zusaetzliche Datenbankabfragen pro Aufruf – bei einer
 * Datenbank in einer anderen Region kostet das spuerbar Zeit und macht jede
 * Seite von der Erreichbarkeit der Datenbank abhaengig.
 *
 * Der Baum wird deshalb serverseitig zwischengespeichert und nur erneuert, wenn
 * sich Kategorien tatsaechlich aendern (oder spaetestens nach fuenf Minuten).
 */
const cachedTree = unstable_cache(() => getCategoryTree(), ["kategorie-baum"], {
  revalidate: 300,
  tags: [KATEGORIE_TAG],
});

/**
 * Kategorien fuer die Navigation. Ist die Datenbank kurzzeitig nicht
 * erreichbar, liefert die Funktion eine leere Liste statt zu scheitern – die
 * Seite bleibt dann ohne Kategorienavigation abrufbar.
 */
export async function navigationCategories(): Promise<CategoryNode[]> {
  try {
    return await cachedTree();
  } catch {
    return [];
  }
}
