"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { saveProductAction, type CatalogActionState } from "@/app/actions/admin-catalog";
import { slugify } from "@/lib/validation";

type CategoryOption = { id: string; name: string; parentId: string | null };
type ProductOption = { id: string; name: string };

type ProductInput = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  taxRate: number;
  weightGrams: number;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  deliveryTime: string | null;
  isActive: boolean;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryIds: string[];
  relatedProductIds: string[];
  quantity: number;
  lowStockThreshold: number;
};

function euro(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Produkt speichern"}
    </button>
  );
}

/** Produktformular – deckt alle Felder aus Punkt 9 ab, ohne Programmierkenntnisse bedienbar. */
export function ProductForm({
  categories,
  allProducts,
  product,
}: {
  categories: CategoryOption[];
  allProducts: ProductOption[];
  product?: ProductInput;
}) {
  const [state, action] = useActionState<CatalogActionState, FormData>(saveProductAction, { ok: false });
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));

  return (
    <form action={action} className="space-y-6">
      {product && <input type="hidden" name="productId" value={product.id} />}

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Grunddaten</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Produktname *</label>
            <input
              id="name" name="name" required value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="sku" className="label">Artikelnummer (SKU) *</label>
            <input id="sku" name="sku" required defaultValue={product?.sku} className="field font-mono" />
          </div>
          <div>
            <label htmlFor="slug" className="label">URL-Slug *</label>
            <input
              id="slug" name="slug" required value={slug}
              onChange={(event) => { setSlug(event.target.value); setSlugTouched(true); }}
              className="field font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="shortDescription" className="label">Kurzbeschreibung</label>
            <textarea id="shortDescription" name="shortDescription" rows={2} defaultValue={product?.shortDescription ?? ""} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">Beschreibung</label>
            <textarea id="description" name="description" rows={7} defaultValue={product?.description ?? ""} className="field" />
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Preis &amp; Bestand</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="price" className="label">Preis (€, brutto) *</label>
            <input id="price" name="price" required inputMode="decimal" defaultValue={euro(product?.priceCents)} className="field tabular" />
          </div>
          <div>
            <label htmlFor="compareAtPrice" className="label">UVP / Streichpreis (€)</label>
            <input id="compareAtPrice" name="compareAtPrice" inputMode="decimal" defaultValue={euro(product?.compareAtPriceCents)} className="field tabular" />
          </div>
          <div>
            <label htmlFor="taxRate" className="label">MwSt. (%)</label>
            <input id="taxRate" name="taxRate" type="number" min={0} max={30} defaultValue={product?.taxRate ?? 19} className="field tabular" />
          </div>
          <div>
            <label htmlFor="quantity" className="label">Lagerbestand</label>
            <input id="quantity" name="quantity" type="number" min={0} defaultValue={product?.quantity ?? 0} className="field tabular" />
          </div>
          <div>
            <label htmlFor="lowStockThreshold" className="label">Warnschwelle</label>
            <input id="lowStockThreshold" name="lowStockThreshold" type="number" min={0} defaultValue={product?.lowStockThreshold ?? 5} className="field tabular" />
          </div>
          <div>
            <label htmlFor="deliveryTime" className="label">Lieferzeit</label>
            <input id="deliveryTime" name="deliveryTime" defaultValue={product?.deliveryTime ?? "2–4 Werktage"} className="field" />
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Versanddaten</h2>
        <p className="mt-1 text-sm text-mist-700">Gewicht und Maße werden für das DHL-Versandetikett verwendet.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="weightGrams" className="label">Gewicht (g) *</label>
            <input id="weightGrams" name="weightGrams" type="number" min={1} required defaultValue={product?.weightGrams ?? 500} className="field tabular" />
          </div>
          <div>
            <label htmlFor="lengthMm" className="label">Länge (mm)</label>
            <input id="lengthMm" name="lengthMm" type="number" min={0} defaultValue={product?.lengthMm ?? ""} className="field tabular" />
          </div>
          <div>
            <label htmlFor="widthMm" className="label">Breite (mm)</label>
            <input id="widthMm" name="widthMm" type="number" min={0} defaultValue={product?.widthMm ?? ""} className="field tabular" />
          </div>
          <div>
            <label htmlFor="heightMm" className="label">Höhe (mm)</label>
            <input id="heightMm" name="heightMm" type="number" min={0} defaultValue={product?.heightMm ?? ""} className="field tabular" />
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Kategorien &amp; Cross-Selling</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="label">Kategorien</legend>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-mist-200 p-3">
              {categories.length === 0 && <p className="text-sm text-mist-700">Noch keine Kategorien angelegt.</p>}
              {categories.map((category) => (
                <label key={category.id} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                  <input
                    type="checkbox" name="categoryIds" value={category.id}
                    defaultChecked={product?.categoryIds.includes(category.id)}
                    className="h-4.5 w-4.5 rounded border-mist-300 text-signal-500 focus:ring-signal-500"
                  />
                  <span className={category.parentId ? "pl-3 text-mist-700" : "font-semibold"}>{category.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Passende Produkte (Cross-Selling)</legend>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-mist-200 p-3">
              {allProducts.length === 0 && <p className="text-sm text-mist-700">Keine weiteren Produkte vorhanden.</p>}
              {allProducts.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                  <input
                    type="checkbox" name="relatedProductIds" value={item.id}
                    defaultChecked={product?.relatedProductIds.includes(item.id)}
                    className="h-4.5 w-4.5 rounded border-mist-300 text-signal-500 focus:ring-signal-500"
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">SEO &amp; Sichtbarkeit</h2>
        <div className="mt-5 grid gap-4">
          <div>
            <label htmlFor="seoTitle" className="label">SEO-Titel</label>
            <input id="seoTitle" name="seoTitle" maxLength={200} defaultValue={product?.seoTitle ?? ""} className="field" />
          </div>
          <div>
            <label htmlFor="seoDescription" className="label">SEO-Beschreibung</label>
            <textarea id="seoDescription" name="seoDescription" rows={2} maxLength={320} defaultValue={product?.seoDescription ?? ""} className="field" />
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} className="h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500" />
              <span className="font-semibold">Im Shop sichtbar</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured ?? false} className="h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500" />
              <span className="font-semibold">Als Bestseller hervorheben</span>
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Submit />
        {state.message && (
          <p className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
