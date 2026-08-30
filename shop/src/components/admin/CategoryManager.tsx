"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteCategoryAction,
  reorderCategoriesAction,
  saveCategoryAction,
  toggleCategoryActiveAction,
  type CatalogActionState,
} from "@/app/actions/admin-catalog";
import { slugify } from "@/lib/validation";

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary py-2.5 text-sm" disabled={pending}>
      {pending ? "Wird gespeichert …" : label}
    </button>
  );
}

/** Kategorieverwaltung: anlegen, bearbeiten, sortieren (Drag & Drop), deaktivieren, löschen. */
export function CategoryManager({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState<CatalogActionState, FormData>(saveCategoryAction, { ok: false });
  const [editing, setEditing] = useState<Category | null>(null);
  const [order, setOrder] = useState(categories);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...order];
    const from = next.findIndex((item) => item.id === draggedId);
    const to = next.findIndex((item) => item.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDraggedId(null);
    void reorderCategoriesAction(next.map((item) => item.id));
  }

  function startEdit(category: Category | null) {
    setEditing(category);
    setName(category?.name ?? "");
    setSlug(category?.slug ?? "");
  }

  const roots = order.filter((item) => !item.parentId);
  const childrenOf = (parentId: string) => order.filter((item) => item.parentId === parentId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Struktur</h2>
        <p className="mt-1 text-sm text-mist-700">Reihenfolge per Drag &amp; Drop ändern.</p>

        <ul className="mt-5 space-y-2">
          {roots.length === 0 && <li className="text-sm text-mist-700">Noch keine Kategorien angelegt.</li>}
          {roots.map((category) => (
            <li key={category.id}>
              <CategoryRow
                category={category}
                onEdit={startEdit}
                onDragStart={() => setDraggedId(category.id)}
                onDrop={() => handleDrop(category.id)}
                isDragging={draggedId === category.id}
              />
              {childrenOf(category.id).length > 0 && (
                <ul className="ml-6 mt-2 space-y-2 border-l-2 border-mist-200 pl-4">
                  {childrenOf(category.id).map((child) => (
                    <li key={child.id}>
                      <CategoryRow
                        category={child}
                        onEdit={startEdit}
                        onDragStart={() => setDraggedId(child.id)}
                        onDrop={() => handleDrop(child.id)}
                        isDragging={draggedId === child.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">
            {editing ? "Kategorie bearbeiten" : "Neue Kategorie"}
          </h2>
          {editing && (
            <button type="button" onClick={() => startEdit(null)} className="text-sm font-semibold text-signal-600 hover:underline">
              Neu anlegen
            </button>
          )}
        </div>

        <form action={action} className="mt-5 space-y-4" key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="categoryId" value={editing.id} />}
          <div>
            <label htmlFor="cat-name" className="label">Name *</label>
            <input
              id="cat-name" name="name" required value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!editing) setSlug(slugify(event.target.value));
              }}
              className="field py-2.5"
            />
          </div>
          <div>
            <label htmlFor="cat-slug" className="label">URL-Slug *</label>
            <input
              id="cat-slug" name="slug" required value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="field py-2.5 font-mono"
            />
          </div>
          <div>
            <label htmlFor="cat-parent" className="label">Übergeordnete Kategorie</label>
            <select id="cat-parent" name="parentId" defaultValue={editing?.parentId ?? ""} className="field py-2.5">
              <option value="">– keine (Hauptkategorie) –</option>
              {order
                .filter((item) => !item.parentId && item.id !== editing?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="cat-description" className="label">Beschreibung</label>
            <textarea id="cat-description" name="description" rows={3} defaultValue={editing?.description ?? ""} className="field" />
          </div>
          <div>
            <label htmlFor="cat-image" className="label">Bild-URL</label>
            <input id="cat-image" name="imageUrl" defaultValue={editing?.imageUrl ?? ""} placeholder="/uploads/… oder https://…" className="field py-2.5" />
          </div>
          <div>
            <label htmlFor="cat-seo-title" className="label">SEO-Titel</label>
            <input id="cat-seo-title" name="seoTitle" defaultValue={editing?.seoTitle ?? ""} className="field py-2.5" />
          </div>
          <div>
            <label htmlFor="cat-seo-desc" className="label">SEO-Beschreibung</label>
            <textarea id="cat-seo-desc" name="seoDescription" rows={2} defaultValue={editing?.seoDescription ?? ""} className="field" />
          </div>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} className="h-5 w-5 rounded border-mist-300 text-signal-500 focus:ring-signal-500" />
            <span className="font-semibold">Im Shop sichtbar</span>
          </label>

          <Submit label={editing ? "Änderungen speichern" : "Kategorie anlegen"} />
          {state.message && (
            <p className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
              {state.message}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDragStart,
  onDrop,
  isDragging,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDragStart: () => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`flex cursor-grab flex-wrap items-center gap-3 rounded-xl border p-3.5 transition-colors active:cursor-grabbing ${
        isDragging ? "border-signal-500 bg-signal-50" : "border-mist-200 bg-white"
      }`}
    >
      <span className="font-mono text-xs text-mist-500" aria-hidden>⠿</span>
      {category.imageUrl && (
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-mist-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={category.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <span className="flex-1">
        <span className="block font-semibold">{category.name}</span>
        <span className="block font-mono text-xs text-mist-500">
          /{category.slug} · {category.productCount} Produkte
        </span>
      </span>

      <form action={toggleCategoryActiveAction}>
        <input type="hidden" name="categoryId" value={category.id} />
        <button
          type="submit"
          className={`rounded-full px-3 py-1 font-display text-xs font-bold ${
            category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-mist-100 text-mist-700"
          }`}
        >
          {category.isActive ? "Sichtbar" : "Versteckt"}
        </button>
      </form>

      <button type="button" onClick={() => onEdit(category)} className="text-sm font-semibold text-signal-600 hover:underline">
        Bearbeiten
      </button>

      <form action={deleteCategoryAction}>
        <input type="hidden" name="categoryId" value={category.id} />
        <button type="submit" className="text-sm text-red-600 hover:underline">Löschen</button>
      </form>
    </div>
  );
}
