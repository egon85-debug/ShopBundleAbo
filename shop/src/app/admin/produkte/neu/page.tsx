import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { ProductForm } from "@/components/admin/ProductForm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";

export const metadata: Metadata = { title: "Produkt anlegen", robots: { index: false } };

// Wie alle Backoffice-Seiten: nie vorab erzeugen (siehe admin/layout.tsx).
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [allCategories, allProducts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position), asc(categories.name)),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
  ]);

  return (
    <>
      <p className="eyebrow">Backoffice</p>
      <h1 className="mt-2 font-display text-display-md font-extrabold">Produkt anlegen</h1>
      <div className="mt-8">
        <ProductForm categories={allCategories} allProducts={allProducts} />
      </div>
    </>
  );
}
