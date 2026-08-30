import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { ProductForm } from "@/components/admin/ProductForm";
import { ProductImageManager } from "@/components/admin/ProductImageManager";
import { db } from "@/db";
import {
  categories,
  inventory,
  productCategories,
  productImages,
  productRelations_,
  products,
} from "@/db/schema";

export const metadata: Metadata = { title: "Produkt bearbeiten", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) notFound();

  const [allCategories, allProducts, links, related, images, stock] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position), asc(categories.name)),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select().from(productCategories).where(eq(productCategories.productId, productId)),
    db.select().from(productRelations_).where(eq(productRelations_.productId, productId)).orderBy(asc(productRelations_.position)),
    db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.position)),
    db.select().from(inventory).where(sql`${inventory.productId} = ${productId} and ${inventory.variantId} is null`).limit(1),
  ]);

  return (
    <>
      <Link href="/admin/produkte" className="text-sm font-semibold text-signal-600 hover:underline">
        ← Zurück zur Produktliste
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-display-md font-extrabold">{product.name}</h1>
        <Link href={`/produkt/${product.slug}`} target="_blank" className="btn-ghost py-2.5 text-sm">
          Im Shop ansehen ↗
        </Link>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <ProductForm
          categories={allCategories}
          allProducts={allProducts.filter((item) => item.id !== productId)}
          product={{
            ...product,
            categoryIds: links.map((link) => link.categoryId),
            relatedProductIds: related.map((item) => item.relatedProductId),
            quantity: stock[0]?.quantity ?? 0,
            lowStockThreshold: stock[0]?.lowStockThreshold ?? 5,
          }}
        />
        <ProductImageManager productId={productId} images={images} />
      </div>
    </>
  );
}
