"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  inventory,
  productCategories,
  productImages,
  productRelations_,
  products,
} from "@/db/schema";
import { KATEGORIE_TAG } from "@/services/navigation";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { lagerAenderungen, meldeProduktAenderung, meldungsHinweis } from "@/lib/lager-meldung";
import { parseToCents } from "@/lib/money";
import { categorySchema, productSchema, slugify } from "@/lib/validation";

export type CatalogActionState = { ok: boolean; message?: string; id?: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/* ─────────────────────────── Produkte ─────────────────────────── */

function readProductForm(formData: FormData) {
  const number = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const name = String(formData.get("name") ?? "").trim();
  return productSchema.safeParse({
    sku: String(formData.get("sku") ?? "").trim(),
    name,
    slug: String(formData.get("slug") ?? "").trim() || slugify(name),
    shortDescription: String(formData.get("shortDescription") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    priceCents: parseToCents(String(formData.get("price") ?? "")) ?? -1,
    compareAtPriceCents: parseToCents(String(formData.get("compareAtPrice") ?? "")),
    taxRate: number("taxRate") ?? 19,
    weightGrams: number("weightGrams") ?? 500,
    lengthMm: number("lengthMm"),
    widthMm: number("widthMm"),
    heightMm: number("heightMm"),
    deliveryTime: String(formData.get("deliveryTime") ?? "") || null,
    isActive: formData.get("isActive") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    seoTitle: String(formData.get("seoTitle") ?? "") || null,
    seoDescription: String(formData.get("seoDescription") ?? "") || null,
    categoryIds: formData.getAll("categoryIds").map(String).filter(Boolean),
    relatedProductIds: formData.getAll("relatedProductIds").map(String).filter(Boolean),
    quantity: number("quantity") ?? 0,
    lowStockThreshold: number("lowStockThreshold") ?? 5,
  });
}

export async function saveProductAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const admin = await requireAdmin();
  const parsed = readProductForm(formData);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  }
  const input = parsed.data;
  const productId = String(formData.get("productId") ?? "") || null;

  const values = {
    sku: input.sku,
    name: input.name,
    slug: input.slug,
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    priceCents: input.priceCents,
    compareAtPriceCents: input.compareAtPriceCents ?? null,
    taxRate: input.taxRate,
    weightGrams: input.weightGrams,
    lengthMm: input.lengthMm ?? null,
    widthMm: input.widthMm ?? null,
    heightMm: input.heightMm ?? null,
    deliveryTime: input.deliveryTime ?? null,
    isActive: input.isActive,
    isFeatured: input.isFeatured,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
  };

  // Alter Stand für die Meldung ans Lager (dort unter der bisherigen SKU bekannt).
  const [vorher] = productId
    ? await db.select().from(products).where(eq(products.id, productId)).limit(1)
    : [];

  try {
    const id = await db.transaction(async (tx) => {
      let id = productId;
      if (id) {
        await tx.update(products).set(values).where(eq(products.id, id));
      } else {
        const [created] = await tx.insert(products).values(values).returning();
        id = created.id;
      }

      // Kategorien neu setzen (einfacher und konsistenter als Differenzbildung).
      await tx.delete(productCategories).where(eq(productCategories.productId, id));
      if (input.categoryIds.length > 0) {
        await tx.insert(productCategories).values(
          input.categoryIds.map((categoryId) => ({ productId: id!, categoryId })),
        );
      }

      await tx.delete(productRelations_).where(eq(productRelations_.productId, id));
      const related = input.relatedProductIds.filter((relatedId) => relatedId !== id);
      if (related.length > 0) {
        await tx.insert(productRelations_).values(
          related.map((relatedProductId, position) => ({ productId: id!, relatedProductId, position })),
        );
      }

      // Bestand: eine Zeile je Produkt (Basisbestand ohne Variante).
      const [existingStock] = await tx
        .select()
        .from(inventory)
        .where(and(eq(inventory.productId, id), sql`${inventory.variantId} is null`))
        .limit(1);

      if (existingStock) {
        await tx
          .update(inventory)
          .set({ quantity: input.quantity, lowStockThreshold: input.lowStockThreshold })
          .where(eq(inventory.id, existingStock.id));
      } else {
        await tx.insert(inventory).values({
          productId: id,
          quantity: input.quantity,
          lowStockThreshold: input.lowStockThreshold,
        });
      }

      return id!;
    });

    await logAudit({
      adminUserId: admin.id,
      adminName: admin.name,
      entityType: "product",
      entityId: id,
      action: productId ? "update" : "create",
      newValue: input.name,
    });

    revalidatePath("/admin/produkte");
    revalidatePath("/shop");
    revalidatePath(`/produkt/${input.slug}`);

    let hinweis = "";
    if (vorher) {
      const aenderung = await meldeProduktAenderung(vorher.sku, "update", lagerAenderungen(vorher, values));
      hinweis = meldungsHinweis(aenderung);
      if (vorher.isActive !== values.isActive) {
        const status = await meldeProduktAenderung(vorher.sku, values.isActive ? "activate" : "deactivate");
        hinweis ||= meldungsHinweis(status);
      }
    }
    return { ok: true, message: `Produkt gespeichert.${hinweis}`, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    if (message.includes("unique") || message.includes("duplicate")) {
      return { ok: false, message: "SKU oder URL-Slug ist bereits vergeben." };
    }
    return { ok: false, message };
  }
}

export async function duplicateProductAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const [source] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!source) return;

  const suffix = Date.now().toString(36).slice(-4);
  const [copy] = await db
    .insert(products)
    .values({
      ...source,
      id: undefined as unknown as string,
      sku: `${source.sku}-${suffix}`,
      slug: `${source.slug}-kopie-${suffix}`,
      name: `${source.name} (Kopie)`,
      isActive: false,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
    })
    .returning();

  const links = await db.select().from(productCategories).where(eq(productCategories.productId, productId));
  if (links.length > 0) {
    await db.insert(productCategories).values(links.map((link) => ({ productId: copy.id, categoryId: link.categoryId })));
  }
  await db.insert(inventory).values({ productId: copy.id, quantity: 0 });

  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "product",
    entityId: copy.id,
    action: "duplicate",
    oldValue: source.sku,
    newValue: copy.sku,
  });
  revalidatePath("/admin/produkte");
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return;

  await db.update(products).set({ isActive: !product.isActive }).where(eq(products.id, productId));
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "product",
    entityId: productId,
    action: "update",
    field: "isActive",
    oldValue: product.isActive,
    newValue: !product.isActive,
  });
  await meldeProduktAenderung(product.sku, product.isActive ? "deactivate" : "activate");
  revalidatePath("/admin/produkte");
  revalidatePath("/shop");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return;

  await db.delete(products).where(eq(products.id, productId));
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "product",
    entityId: productId,
    action: "delete",
    oldValue: product.sku,
  });
  await meldeProduktAenderung(product.sku, "delete");
  revalidatePath("/admin/produkte");
  revalidatePath("/shop");
}

/* ─────────────────────────── Bilder ─────────────────────────── */

export async function uploadProductImageAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Bitte eine Bilddatei auswählen." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: `Dateityp ${file.type} ist nicht erlaubt (JPEG, PNG, WebP, AVIF).` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Datei ist größer als 8 MB." };
  }

  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[file.type]!;
  const fileName = `${randomUUID()}.${extension}`;
  const uploadDir = path.resolve(process.env.UPLOADS_DIR ?? "./public/uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  const [{ position }] = await db
    .select({ position: sql<number>`coalesce(max(${productImages.position}), -1) + 1` })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  await db.insert(productImages).values({
    productId,
    url: `/uploads/${fileName}`,
    alt: String(formData.get("alt") ?? "") || null,
    position,
  });

  revalidatePath(`/admin/produkte/${productId}`);
  return { ok: true, message: "Bild hochgeladen." };
}

export async function deleteProductImageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const imageId = String(formData.get("imageId") ?? "");
  const [image] = await db.select().from(productImages).where(eq(productImages.id, imageId)).limit(1);
  if (!image) return;
  await db.delete(productImages).where(eq(productImages.id, imageId));
  revalidatePath(`/admin/produkte/${image.productId}`);
}

/** Bildreihenfolge per Drag & Drop – der Client sendet die neue Reihenfolge. */
export async function reorderProductImagesAction(productId: string, imageIds: string[]): Promise<void> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    for (const [position, imageId] of imageIds.entries()) {
      await tx
        .update(productImages)
        .set({ position })
        .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    }
  });
  revalidatePath(`/admin/produkte/${productId}`);
  revalidatePath("/shop");
}

/* ─────────────────────────── Kategorien ─────────────────────────── */

export async function saveCategoryAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const parsed = categorySchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "").trim() || slugify(name),
    parentId: String(formData.get("parentId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    imageUrl: String(formData.get("imageUrl") ?? "") || null,
    isActive: formData.get("isActive") === "on",
    seoTitle: String(formData.get("seoTitle") ?? "") || null,
    seoDescription: String(formData.get("seoDescription") ?? "") || null,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  }

  const categoryId = String(formData.get("categoryId") ?? "") || null;
  if (categoryId && parsed.data.parentId === categoryId) {
    return { ok: false, message: "Eine Kategorie kann sich nicht selbst übergeordnet sein." };
  }

  try {
    let id = categoryId;
    if (id) {
      await db.update(categories).set(parsed.data).where(eq(categories.id, id));
    } else {
      const [{ position }] = await db
        .select({ position: sql<number>`coalesce(max(${categories.position}), -1) + 1` })
        .from(categories);
      const [created] = await db.insert(categories).values({ ...parsed.data, position }).returning();
      id = created.id;
    }

    await logAudit({
      adminUserId: admin.id,
      adminName: admin.name,
      entityType: "category",
      entityId: id,
      action: categoryId ? "update" : "create",
      newValue: parsed.data.name,
    });

    revalidatePath("/admin/kategorien");
    revalidateTag(KATEGORIE_TAG);
    revalidatePath("/shop");
    revalidatePath("/");
    return { ok: true, message: "Kategorie gespeichert.", id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return {
      ok: false,
      message: message.includes("unique") ? "Dieser URL-Slug ist bereits vergeben." : message,
    };
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) return;

  const children = await db.select().from(categories).where(eq(categories.parentId, categoryId));
  if (children.length > 0) {
    // Unterkategorien rücken eine Ebene nach oben, statt mitgelöscht zu werden.
    await db.update(categories).set({ parentId: category.parentId }).where(eq(categories.parentId, categoryId));
  }

  await db.delete(categories).where(eq(categories.id, categoryId));
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "category",
    entityId: categoryId,
    action: "delete",
    oldValue: category.name,
  });
  revalidatePath("/admin/kategorien");
  revalidateTag(KATEGORIE_TAG);
  revalidatePath("/shop");
}

export async function toggleCategoryActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) return;
  await db.update(categories).set({ isActive: !category.isActive }).where(eq(categories.id, categoryId));
  revalidatePath("/admin/kategorien");
  revalidateTag(KATEGORIE_TAG);
  revalidatePath("/shop");
}

/** Kategoriereihenfolge per Drag & Drop speichern. */
export async function reorderCategoriesAction(orderedIds: string[]): Promise<void> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx.update(categories).set({ position }).where(eq(categories.id, id));
    }
  });
  revalidatePath("/admin/kategorien");
  revalidateTag(KATEGORIE_TAG);
  revalidatePath("/shop");
  revalidatePath("/");
}

export async function listCategoriesFlat() {
  return db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
}
