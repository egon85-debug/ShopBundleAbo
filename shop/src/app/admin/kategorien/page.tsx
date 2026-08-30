import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";

import { CategoryManager } from "@/components/admin/CategoryManager";
import { db } from "@/db";
import { categories, productCategories } from "@/db/schema";

export const metadata: Metadata = { title: "Kategorien", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const rows = await db
    .select({
      category: categories,
      productCount: sql<number>`(
        select count(*)::int from ${productCategories}
        where ${productCategories.categoryId} = ${categories.id}
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));

  return (
    <>
      <p className="eyebrow">Backoffice</p>
      <h1 className="mt-2 font-display text-display-md font-extrabold">Kategorien</h1>
      <p className="mt-1 text-mist-700">
        Änderungen erscheinen sofort im Shop – Navigation und Filter werden dynamisch aus diesen Daten gebaut.
      </p>

      <div className="mt-8">
        <CategoryManager
          categories={rows.map(({ category, productCount }) => ({ ...category, productCount }))}
        />
      </div>
    </>
  );
}
