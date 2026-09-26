import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  inventory,
  productCategories,
  productImages,
  products,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/validation";

/**
 * Uebernahme eines Artikels aus der Lagererfassung in den Shop.
 *
 * Schluessel ist die SKU: derselbe Artikel zweimal geschickt ergibt denselben
 * Datensatz, nicht zwei. Damit ist ein wiederholter Versuch nach einem
 * Netzwerkfehler gefahrlos.
 *
 * Nur mitgeschickte Felder werden geschrieben. Was das Lager nicht kennt (etwa
 * ein im Backoffice gepflegter SEO-Text), bleibt unangetastet.
 */
export const ingestArtikelSchema = z
  .object({
    /** Fachlicher Schlüssel. Für einen neuen Artikel zwingend. */
    sku: z.string().trim().min(1).max(64).optional(),
    /** Alternativer Zugriff auf einen bereits übernommenen Artikel. */
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(300).optional(),
    slug: z.string().trim().max(320).optional(),
    kurzbeschreibung: z.string().trim().max(2000).optional(),
    beschreibung: z.string().trim().optional(),
    /** Bruttopreis in Cent – Geld wird nie als Fliesskommazahl gefuehrt. */
    preisCents: z.number().int().min(0).optional(),
    streichpreisCents: z.number().int().min(0).nullable().optional(),
    steuersatz: z.number().int().min(0).max(100).optional(),
    gewichtGramm: z.number().int().min(0).optional(),
    ean: z.string().trim().max(14).nullable().optional(),
    zustand: z.string().trim().max(60).optional(),
    merkmale: z.record(z.string(), z.string()).optional(),
    kategorien: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(160),
          slug: z.string().trim().max(180).optional(),
        }),
      )
      .optional(),
    bilder: z
      .array(
        z.object({
          url: z.string().trim().url().max(2000),
          alt: z.string().trim().max(300).optional(),
        }),
      )
      .optional(),
    bestand: z.number().int().min(0).optional(),
    aktiv: z.boolean().optional(),
    seoTitel: z.string().trim().max(200).optional(),
    seoBeschreibung: z.string().trim().max(320).optional(),
    /** Lebensmittel & Getränke. `null` löscht die Angabe im Shop. */
    inhalt: z
      .object({
        /** Menge je Einheit in ganzen ml bzw. g. */
        menge: z.number().int().min(1).max(10_000_000),
        einheit: z.enum(["ml", "g"]),
        anzahl: z.number().int().min(1).max(10_000).default(1),
      })
      .nullable()
      .optional(),
    pfandCents: z.number().int().min(0).max(100_000).nullable().optional(),
    pfandArt: z.enum(["einweg", "mehrweg"]).nullable().optional(),
    zutaten: z.string().trim().max(5000).nullable().optional(),
    allergene: z.string().trim().max(2000).nullable().optional(),
    lebensmittelHinweise: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((wert) => Boolean(wert.sku || wert.id), {
    message: "sku oder id wird benötigt",
    path: ["sku"],
  });

export type IngestArtikel = z.infer<typeof ingestArtikelSchema>;

export type IngestErgebnis = {
  id: string;
  sku: string;
  slug: string;
  angelegt: boolean;
  pfad: string;
};

/** Fehler mit einer Aussage, die der Aufrufer dem Anwender zeigen darf. */
export class IngestFehler extends Error {}

/**
 * Freien Slug finden. Kollidiert der Wunsch-Slug mit einem *anderen* Artikel,
 * haengen wir die SKU an, statt dessen Adresse zu kapern.
 */
async function freierSlug(wunsch: string, sku: string, eigeneId: string | null): Promise<string> {
  const [belegt] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, wunsch))
    .limit(1);
  if (!belegt || belegt.id === eigeneId) return wunsch;
  return `${wunsch}-${slugify(sku)}`.slice(0, 320);
}

/** Kategorie anhand des Slugs finden oder anlegen – nichts ist fest verdrahtet. */
async function kategorieId(name: string, slugWunsch?: string): Promise<string> {
  const slug = (slugWunsch?.trim() || slugify(name)).slice(0, 180);
  const [vorhanden] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (vorhanden) return vorhanden.id;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${categories.position}), 0)` })
    .from(categories);
  const [neu] = await db
    .insert(categories)
    .values({ name, slug, position: Number(max) + 1 })
    .returning({ id: categories.id });
  return neu.id;
}

/** Nur mitgeschickte Lebensmittelangaben schreiben; `null` leert sie. */
export function lebensmittelWerte(eingabe: IngestArtikel) {
  const leer = (wert: string | null | undefined) => (wert?.trim() ? wert.trim() : null);
  return {
    ...(eingabe.inhalt !== undefined && {
      netContentAmount: eingabe.inhalt?.menge ?? null,
      netContentUnit: eingabe.inhalt?.einheit ?? null,
      unitsPerPack: eingabe.inhalt ? eingabe.inhalt.anzahl : null,
    }),
    ...(eingabe.pfandCents !== undefined && { depositCents: eingabe.pfandCents ?? 0 }),
    ...(eingabe.pfandArt !== undefined && { depositType: eingabe.pfandArt }),
    ...(eingabe.zutaten !== undefined && { ingredients: leer(eingabe.zutaten) }),
    ...(eingabe.allergene !== undefined && { allergens: leer(eingabe.allergene) }),
    ...(eingabe.lebensmittelHinweise !== undefined && { foodNotes: leer(eingabe.lebensmittelHinweise) }),
  };
}

export async function uebernehmeArtikel(eingabe: IngestArtikel): Promise<IngestErgebnis> {
  // Vorrang hat die id: sie zeigt eindeutig auf einen bereits uebernommenen
  // Artikel, auch wenn dessen SKU im Backoffice geaendert wurde.
  const [bestehend] = await db
    .select()
    .from(products)
    .where(eingabe.id ? eq(products.id, eingabe.id) : eq(products.sku, eingabe.sku ?? ""))
    .limit(1);

  if (!bestehend && eingabe.id) {
    throw new IngestFehler("Artikel mit dieser id ist im Shop nicht vorhanden.");
  }
  if (!bestehend) {
    if (!eingabe.name) throw new IngestFehler("Für einen neuen Artikel wird ein Name benötigt.");
    if (eingabe.preisCents === undefined) {
      throw new IngestFehler("Für einen neuen Artikel wird ein Preis benötigt.");
    }
  }

  const sku = bestehend?.sku ?? eingabe.sku!;
  const name = eingabe.name ?? bestehend!.name;
  const slug = await freierSlug(
    (eingabe.slug?.trim() || (eingabe.name ? slugify(eingabe.name) : bestehend!.slug)).slice(0, 320),
    sku,
    bestehend?.id ?? null,
  );

  // Nur gesetzte Felder schreiben – Gepflegtes im Backoffice bleibt erhalten.
  const werte = {
    name,
    slug,
    ...(eingabe.kurzbeschreibung !== undefined && { shortDescription: eingabe.kurzbeschreibung }),
    ...(eingabe.beschreibung !== undefined && { description: eingabe.beschreibung }),
    ...(eingabe.preisCents !== undefined && { priceCents: eingabe.preisCents }),
    ...(eingabe.streichpreisCents !== undefined && { compareAtPriceCents: eingabe.streichpreisCents }),
    ...(eingabe.steuersatz !== undefined && { taxRate: eingabe.steuersatz }),
    ...(eingabe.gewichtGramm !== undefined && { weightGrams: eingabe.gewichtGramm }),
    ...(eingabe.aktiv !== undefined && { isActive: eingabe.aktiv }),
    ...(eingabe.seoTitel !== undefined && { seoTitle: eingabe.seoTitel }),
    ...(eingabe.seoBeschreibung !== undefined && { seoDescription: eingabe.seoBeschreibung }),
    ...lebensmittelWerte(eingabe),
    updatedAt: new Date(),
  };

  // EAN und Zustand haben keine eigene Spalte – sie gehoeren zu den technischen Daten.
  const merkmale: Record<string, string> = {
    ...(bestehend?.technicalData ?? {}),
    ...(eingabe.merkmale ?? {}),
  };
  if (eingabe.ean !== undefined) {
    if (eingabe.ean) merkmale.EAN = eingabe.ean;
    else delete merkmale.EAN;
  }
  if (eingabe.zustand !== undefined) merkmale.Zustand = eingabe.zustand;

  const artikelId = bestehend
    ? (
        await db
          .update(products)
          .set({ ...werte, technicalData: merkmale })
          .where(eq(products.id, bestehend.id))
          .returning({ id: products.id })
      )[0].id
    : (
        await db
          .insert(products)
          .values({
            sku,
            priceCents: eingabe.preisCents!,
            technicalData: merkmale,
            ...werte,
          })
          .returning({ id: products.id })
      )[0].id;

  // Kategorien: mitgeschickte Liste ersetzt die Zuordnung vollstaendig.
  if (eingabe.kategorien) {
    const ids = new Set<string>();
    for (const kategorie of eingabe.kategorien) {
      ids.add(await kategorieId(kategorie.name, kategorie.slug));
    }
    await db.delete(productCategories).where(eq(productCategories.productId, artikelId));
    if (ids.size > 0) {
      await db
        .insert(productCategories)
        .values([...ids].map((categoryId) => ({ productId: artikelId, categoryId })))
        .onConflictDoNothing();
    }
  }

  // Bilder: ebenfalls ersetzend, damit entfernte Aufnahmen verschwinden.
  if (eingabe.bilder) {
    await db.delete(productImages).where(eq(productImages.productId, artikelId));
    if (eingabe.bilder.length > 0) {
      await db.insert(productImages).values(
        eingabe.bilder.map((bild, position) => ({
          productId: artikelId,
          url: bild.url,
          alt: bild.alt ?? name,
          position,
        })),
      );
    }
  }

  // Bestand des Hauptartikels (ohne Variante).
  if (eingabe.bestand !== undefined) {
    const [vorhanden] = await db
      .select({ id: inventory.id })
      .from(inventory)
      .where(and(eq(inventory.productId, artikelId), isNull(inventory.variantId)))
      .limit(1);
    if (vorhanden) {
      await db
        .update(inventory)
        .set({ quantity: eingabe.bestand, updatedAt: new Date() })
        .where(eq(inventory.id, vorhanden.id));
    } else {
      await db.insert(inventory).values({ productId: artikelId, quantity: eingabe.bestand });
    }
  }

  await logAudit({
    adminName: "Lagererfassung",
    entityType: "product",
    entityId: artikelId,
    action: bestehend ? "ingest_update" : "ingest_create",
    newValue: { sku, name, slug },
    reason: "Übernahme aus der Lagererfassung",
  });

  return {
    id: artikelId,
    sku,
    slug,
    angelegt: !bestehend,
    pfad: `/produkt/${slug}`,
  };
}
