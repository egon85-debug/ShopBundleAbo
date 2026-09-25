"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { addToCartAction, type ActionState } from "@/app/actions/shop";
import { WARENKORB_GEAENDERT } from "@/components/ui/CartBadge";

type Variant = { id: string; name: string; priceCents: number | null };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf-aktion w-full sm:w-auto" disabled={disabled || pending}>
      {pending ? "Wird hinzugefügt …" : "In den Warenkorb"}
    </button>
  );
}

export function AddToCartForm({
  productId,
  variants,
  disabled = false,
  maxQuantity = 99,
}: {
  productId: string;
  variants: Variant[];
  disabled?: boolean;
  maxQuantity?: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(addToCartAction, { ok: false });
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const letzteMeldung = useRef<string | undefined>(undefined);

  // Erst wenn der Server bestätigt hat, zählt der Warenkorb oben hoch.
  useEffect(() => {
    if (!state.ok || state.message === letzteMeldung.current) return;
    letzteMeldung.current = state.message;
    window.dispatchEvent(new Event(WARENKORB_GEAENDERT));
  }, [state]);

  return (
    <form action={action} className="mt-8">
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 0 && <input type="hidden" name="variantId" value={variantId} />}

      {variants.length > 0 && (
        <div className="mb-6">
          <span className="feldname">Variante</span>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setVariantId(variant.id)}
                aria-pressed={variantId === variant.id}
                className={`knopf-klein px-4 ${variantId === variant.id ? "border-tinte font-medium text-tinte" : ""}`}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="quantity" className="feldname">
            Menge
          </label>
          <div className="flex h-[56px] items-center rounded-pille border border-haarlinie bg-white px-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-10 w-10 rounded-full text-heading-sm font-light text-kohle hover:bg-leinen"
              aria-label="Menge verringern"
            >
              −
            </button>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              className="w-12 border-0 bg-transparent p-0 text-center text-body tabular focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              className="h-10 w-10 rounded-full text-heading-sm font-light text-kohle hover:bg-leinen"
              aria-label="Menge erhöhen"
            >
              +
            </button>
          </div>
        </div>
        <SubmitButton disabled={disabled} />
      </div>

      {state.message && (
        <p className={`mt-4 ${state.ok ? "hinweis-ok" : "hinweis-fehler"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
