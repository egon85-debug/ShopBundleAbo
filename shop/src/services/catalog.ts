import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  inventory,
  productCategories,
  productImages,
  productRelations_,
  productVariants,
  products,
} from "@/db/schema";

export type CategoryNode = typeof categories.$inferSelect & { children: CategoryNode[] };

/** Kategoriebaum – Grundlage für Navigation und Filter. Nichts ist hartkodiert. */
export async function getCategoryTree(includeInactive = false): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(includeInactive ? undefined : eq(categories.isActive, true))
    .orderBy(asc(categories.position), asc(categories.name));

  const byId = new Map<string, CategoryNode>();
  rows.forEach((row) => byId.set(row.id, { ...row, children: [] }));

  const roots: CategoryNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

export async function getCategoryBySlug(slug: string) {
  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return category ?? null;
}

/** Alle Nachfahren einer Kategorie – Produkte der Unterkategorien zählen mit. */
export async function categoryWithDescendantIds(categoryId: string): Promise<string[]> {
  const all = await db.select({ id: categories.id, parentId: categories.parentId }).from(categories);
  const result = [categoryId];
  let frontier = [categoryId];
  while (frontier.length > 0) {
    const next = all.filter((c) => c.parentId && frontier.includes(c.parentId)).map((c) => c.id);
    result.push(...next);
    frontier = next;
  }
  return result;
}

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  available: number;
  allowBackorder: boolean;
  isFeatured: boolean;
  /** Für Grundpreis und Pfand (Lebensmittel & Getränke). */
  netContentAmount: number | null;
  netContentUnit: string | null;
  unitsPerPack: number | null;
  depositCents: number;
  depositType: string | null;
};

export type ProductQuery = {
  categorySlug?: string;
  search?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStockOnly?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "name_asc";
  limit?: number;
  offset?: number;
  featuredOnly?: boolean;
};

/** Produktliste mit Filtern, Sortierung und Bestandsinformation. */
export async function listProducts(query: ProductQuery = {}): Promise<{ items: ProductListItem[]; total: number }> {
  const conditions = [eq(products.isActive, true)];

  if (query.featuredOnly) conditions.push(eq(products.isFeatured, true));
  if (query.minPriceCents !== undefined) conditions.push(gte(products.priceCents, query.minPriceCents));
  if (query.maxPriceCents !== undefined) conditions.push(lte(products.priceCents, query.maxPriceCents));

  if (query.search) {
    const term = `%${query.search}%`;
    const searchCondition = or(
      ilike(products.name, term),
      ilike(products.sku, term),
      ilike(products.shortDescription, term),
      ilike(products.description, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (query.categorySlug) {
    const category = await getCategoryBySlug(query.categorySlug);
    if (!category) return { items: [], total: 0 };
    const ids = await categoryWithDescendantIds(category.id);
    const productIds = await db
      .select({ id: productCategories.productId })
      .from(productCategories)
      .where(inArray(productCategories.categoryId, ids));
    if (productIds.length === 0) return { items: [], total: 0 };
    conditions.push(inArray(products.id, productIds.map((row) => row.id)));
  }

  const where = and(...conditions);

  const orderBy = {
    newest: desc(products.createdAt),
    price_asc: asc(products.priceCents),
    price_desc: desc(products.priceCents),
    name_asc: asc(products.name),
  }[query.sort ?? "newest"];

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      slug: products.slug,
      shortDescription: products.shortDescription,
      priceCents: products.priceCents,
      compareAtPriceCents: products.compareAtPriceCents,
      isFeatured: products.isFeatured,
      netContentAmount: products.netContentAmount,
      netContentUnit: products.netContentUnit,
      unitsPerPack: products.unitsPerPack,
      depositCents: products.depositCents,
      depositType: products.depositType,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      allowBackorder: inventory.allowBackorder,
    })
    .from(products)
    .leftJoin(inventory, and(eq(inventory.productId, products.id), sql`${inventory.variantId} is null`))
    .where(where)
    .orderBy(orderBy)
    .limit(query.limit ?? 24)
    .offset(query.offset ?? 0);

  const images = rows.length
    ? await db
        .select()
        .from(productImages)
        .where(inArray(productImages.productId, rows.map((row) => row.id)))
        .orderBy(asc(productImages.position))
    : [];

  let items: ProductListItem[] = rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    isFeatured: row.isFeatured,
    imageUrl: images.find((image) => image.productId === row.id)?.url ?? null,
    available: Math.max((row.quantity ?? 0) - (row.reserved ?? 0), 0),
    allowBackorder: row.allowBackorder ?? false,
    netContentAmount: row.netContentAmount,
    netContentUnit: row.netContentUnit,
    unitsPerPack: row.unitsPerPack,
    depositCents: row.depositCents,
    depositType: row.depositType,
  }));

  if (query.inStockOnly) {
    items = items.filter((item) => item.available > 0 || item.allowBackorder);
  }

  return { items, total: count ?? items.length };
}

/** Vollständiges Produkt inkl. Bildern, Varianten, Bestand und Cross-Selling. */
export async function getProductBySlug(slug: string) {
  const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!product) return null;
  return enrichProduct(product);
}

export async function getProductById(id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  return enrichProduct(product);
}

async function enrichProduct(product: typeof products.$inferSelect) {
  const [images, variants, stock, categoryLinks, relatedLinks] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.position)),
    db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.position)),
    db.select().from(inventory).where(eq(inventory.productId, product.id)),
    db.select().from(productCategories).where(eq(productCategories.productId, product.id)),
    db.select().from(productRelations_).where(eq(productRelations_.productId, product.id)).orderBy(asc(productRelations_.position)),
  ]);

  const categoryRows = categoryLinks.length
    ? await db.select().from(categories).where(inArray(categories.id, categoryLinks.map((c) => c.categoryId)))
    : [];

  const relatedProducts = relatedLinks.length
    ? (await listProductsByIds(relatedLinks.map((r) => r.relatedProductId)))
    : [];

  const baseStock = stock.find((row) => row.variantId === null);

  return {
    ...product,
    images,
    variants,
    stock,
    categories: categoryRows,
    relatedProducts,
    available: Math.max((baseStock?.quantity ?? 0) - (baseStock?.reserved ?? 0), 0),
    allowBackorder: baseStock?.allowBackorder ?? false,
  };
}

export async function listProductsByIds(ids: string[]): Promise<ProductListItem[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      slug: products.slug,
      shortDescription: products.shortDescription,
      priceCents: products.priceCents,
      compareAtPriceCents: products.compareAtPriceCents,
      isFeatured: products.isFeatured,
      netContentAmount: products.netContentAmount,
      netContentUnit: products.netContentUnit,
      unitsPerPack: products.unitsPerPack,
      depositCents: products.depositCents,
      depositType: products.depositType,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      allowBackorder: inventory.allowBackorder,
    })
    .from(products)
    .leftJoin(inventory, and(eq(inventory.productId, products.id), sql`${inventory.variantId} is null`))
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));

  const images = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((row) => row.id)))
    .orderBy(asc(productImages.position));

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    isFeatured: row.isFeatured,
    imageUrl: images.find((image) => image.productId === row.id)?.url ?? null,
    available: Math.max((row.quantity ?? 0) - (row.reserved ?? 0), 0),
    allowBackorder: row.allowBackorder ?? false,
    netContentAmount: row.netContentAmount,
    netContentUnit: row.netContentUnit,
    unitsPerPack: row.unitsPerPack,
    depositCents: row.depositCents,
    depositType: row.depositType,
  }));
}

/** Preisspanne für den Preisfilter. */
export async function getPriceRange(): Promise<{ minCents: number; maxCents: number }> {
  const [row] = await db
    .select({
      min: sql<number>`coalesce(min(${products.priceCents}), 0)::int`,
      max: sql<number>`coalesce(max(${products.priceCents}), 0)::int`,
    })
    .from(products)
    .where(eq(products.isActive, true));
  return { minCents: row?.min ?? 0, maxCents: row?.max ?? 0 };
}
