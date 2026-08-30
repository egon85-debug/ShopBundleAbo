"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteProductImageAction,
  reorderProductImagesAction,
  uploadProductImageAction,
  type CatalogActionState,
} from "@/app/actions/admin-catalog";

type Image = { id: string; url: string; alt: string | null; position: number };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-dark w-full py-2.5 text-sm" disabled={pending}>
      {pending ? "Wird hochgeladen …" : "Bild hochladen"}
    </button>
  );
}

/** Bildverwaltung mit Drag & Drop zum Sortieren (HTML5-Drag-API, ohne Bibliothek). */
export function ProductImageManager({ productId, images }: { productId: string; images: Image[] }) {
  const [state, action] = useActionState<CatalogActionState, FormData>(uploadProductImageAction, { ok: false });
  const [order, setOrder] = useState(images);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...order];
    const from = next.findIndex((image) => image.id === draggedId);
    const to = next.findIndex((image) => image.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDraggedId(null);
    void reorderProductImagesAction(productId, next.map((image) => image.id)).then(() => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Produktbilder</h2>
        <p className="mt-1 text-sm text-mist-700">
          Reihenfolge per Drag &amp; Drop ändern. Das erste Bild ist das Hauptbild.
        </p>

        <ul className="mt-4 space-y-2">
          {order.length === 0 && <li className="text-sm text-mist-700">Noch keine Bilder hochgeladen.</li>}
          {order.map((image, index) => (
            <li
              key={image.id}
              draggable
              onDragStart={() => setDraggedId(image.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(image.id)}
              className={`flex cursor-grab items-center gap-3 rounded-xl border p-2.5 transition-colors active:cursor-grabbing ${
                draggedId === image.id ? "border-signal-500 bg-signal-50" : "border-mist-200 bg-white"
              }`}
            >
              <span className="font-mono text-xs text-mist-500" aria-hidden>⠿</span>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-mist-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt ?? ""} className="h-full w-full object-cover" />
              </div>
              <span className="flex-1 truncate text-sm">
                {index === 0 ? <span className="font-semibold">Hauptbild</span> : `Position ${index + 1}`}
              </span>
              <form action={deleteProductImageAction}>
                <input type="hidden" name="imageId" value={image.id} />
                <button type="submit" className="text-sm text-red-600 hover:underline">Löschen</button>
              </form>
            </li>
          ))}
        </ul>

        {saved && <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">Reihenfolge gespeichert.</p>}

        <form action={action} className="mt-5 space-y-3 border-t border-mist-200 pt-5">
          <input type="hidden" name="productId" value={productId} />
          <div>
            <label htmlFor="file" className="label">Neues Bild (JPEG, PNG, WebP, AVIF – max. 8 MB)</label>
            <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required className="field py-2.5" />
          </div>
          <div>
            <label htmlFor="alt" className="label">Bildbeschreibung (Barrierefreiheit)</label>
            <input id="alt" name="alt" className="field py-2.5" />
          </div>
          <Submit />
          {state.message && (
            <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
              {state.message}
            </p>
          )}
        </form>
      </section>
    </aside>
  );
}
