import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";

import { deleteProductAction, duplicateProductAction, toggleProductActiveAction } from "@/app/actions/admin-catalog";
import { db } from "@/db";
import { inventory, productImages, products } from "@/db/schema";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Produkte", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const rows = await db
    .select({
      product: products,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      imageUrl: sql<string | null>`(
        select url from ${productImages}
        where ${productImages.productId} = ${products.id}
        order by ${productImages.position} limit 1
      )`,
    })
    .from(products)
    .leftJoin(inventory, sql`${inventory.productId} = ${products.id} and ${inventory.variantId} is null`)
    .orderBy(asc(products.name));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1 className="mt-2 font-display text-display-md font-extrabold">Produkte</h1>
          <p className="mt-1 text-mist-700">{rows.length} Artikel im Katalog</p>
        </div>
        <Link href="/admin/produkte/neu" className="btn-primary py-2.5">＋ Produkt anlegen</Link>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-mist-200 text-xs uppercase tracking-[.08em] text-mist-700">
              <th className="px-5 py-3 font-display">Produkt</th>
              <th className="px-5 py-3 font-display">SKU</th>
              <th className="px-5 py-3 text-right font-display">Preis</th>
              <th className="px-5 py-3 text-right font-display">Bestand</th>
              <th className="px-5 py-3 font-display">Sichtbar</th>
              <th className="px-5 py-3 text-right font-display">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-200">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-mist-700">
                  Noch keine Produkte.{" "}
                  <Link href="/admin/produkte/neu" className="font-semibold text-signal-600 underline">
                    Erstes Produkt anlegen
                  </Link>
                </td>
              </tr>
            )}
            {rows.map(({ product, quantity, reserved, imageUrl }) => (
              <tr key={product.id} className="hover:bg-mist-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-mist-100">
                      {imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <Link href={`/admin/produkte/${product.id}`} className="font-semibold hover:text-signal-600">
                      {product.name}
                    </Link>
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-sm">{product.sku}</td>
                <td className="px-5 py-3 text-right font-semibold tabular">{formatCents(product.priceCents)}</td>
                <td className="px-5 py-3 text-right font-mono tabular">
                  {(quantity ?? 0) - (reserved ?? 0)}
                  {(reserved ?? 0) > 0 && <span className="text-mist-500"> ({reserved} res.)</span>}
                </td>
                <td className="px-5 py-3">
                  <form action={toggleProductActiveAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <button
                      type="submit"
                      className={`rounded-full px-3 py-1 font-display text-xs font-bold ${
                        product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-mist-100 text-mist-700"
                      }`}
                    >
                      {product.isActive ? "Aktiv" : "Inaktiv"}
                    </button>
                  </form>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-3 text-sm">
                    <Link href={`/admin/produkte/${product.id}`} className="font-semibold text-signal-600 hover:underline">
                      Bearbeiten
                    </Link>
                    <form action={duplicateProductAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <button type="submit" className="text-mist-700 hover:underline">Duplizieren</button>
                    </form>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <button type="submit" className="text-red-600 hover:underline">Löschen</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
