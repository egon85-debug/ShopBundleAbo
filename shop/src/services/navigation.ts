import "server-only";

import { unstable_cache } from "next/cache";

import { getCategoryTree, listProducts, type CategoryNode } from "./catalog";

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

/** Was das Laufband unter der Hinweisleiste pro Artikel braucht – nicht mehr. */
export type Neuheit = {
  id: string;
  name: string;
  slug: string;
  bildUrl: string;
  preisCents: number;
};

const cachedNeuheiten = unstable_cache(
  async (): Promise<Neuheit[]> => {
    const { items } = await listProducts({ sort: "newest", limit: 16 });
    return items
      .filter((item) => item.imageUrl)
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        bildUrl: item.imageUrl!,
        preisCents: item.priceCents,
      }));
  },
  ["neuheiten-band"],
  { revalidate: 60 },
);

/**
 * Die neuesten Artikel mit Bild für das Laufband. Wie bei den Kategorien gilt:
 * Ist die Datenbank nicht erreichbar, gibt es eine leere Liste – das Band
 * fehlt dann einfach, die Seite bleibt abrufbar.
 */
export async function neuheiten(): Promise<Neuheit[]> {
  try {
    return await cachedNeuheiten();
  } catch {
    return [];
  }
}
