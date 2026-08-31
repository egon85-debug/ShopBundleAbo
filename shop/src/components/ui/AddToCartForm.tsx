"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { fliegeInDenWarenkorb } from "@/components/motion/cart-flight";
import { Magnetic } from "@/components/motion/MagneticButton";
import { addToCartAction, type ActionState } from "@/app/actions/shop";

type Variant = { id: string; name: string; priceCents: number | null };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Magnetic className="w-full sm:w-auto" staerke={0.22}>
      <button
        type="submit"
        className="btn-primary w-full transition-transform duration-200 ease-precise active:scale-[.98] sm:w-auto"
        disabled={disabled || pending}
      >
        {pending ? "Wird hinzugefügt …" : "In den Warenkorb"}
      </button>
    </Magnetic>
  );
}

export function AddToCartForm({
  productId,
  variants,
  disabled = false,
  maxQuantity = 99,
  bildUrl = null,
}: {
  productId: string;
  variants: Variant[];
  disabled?: boolean;
  maxQuantity?: number;
  /** Wird beim Flug in den Warenkorb gezeigt. */
  bildUrl?: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(addToCartAction, { ok: false });
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const formular = useRef<HTMLFormElement>(null);
  const letzteMeldung = useRef<string | undefined>(undefined);

  // Erst wenn der Server bestaetigt hat, fliegt das Produkt los. Eine Animation
  // vor der Bestaetigung wuerde einen Erfolg zeigen, den es noch nicht gibt.
  useEffect(() => {
    if (!state.ok || state.message === letzteMeldung.current) return;
    letzteMeldung.current = state.message;
    const quelle =
      formular.current?.closest("[data-produkt-bereich]")?.querySelector("[data-produkt-bild]") ??
      formular.current;
    fliegeInDenWarenkorb(quelle, bildUrl);
  }, [state, bildUrl]);

  return (
    <form ref={formular} action={action} className="mt-6">
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 0 && <input type="hidden" name="variantId" value={variantId} />}

      {variants.length > 0 && (
        <div className="mb-4">
          <span className="label">Variante</span>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setVariantId(variant.id)}
                aria-pressed={variantId === variant.id}
                className={`rounded-xl border px-4 py-2.5 text-[15px] font-semibold transition-colors ${
                  variantId === variant.id
                    ? "border-carbon-900 bg-carbon-900 text-white"
                    : "border-mist-300 bg-white hover:border-carbon-900"
                }`}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-32">
          <label htmlFor="quantity" className="label">
            Menge
          </label>
          <div className="flex items-center rounded-xl border border-mist-300 bg-white">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3.5 py-3 text-lg font-bold text-mist-700 hover:text-carbon-900"
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
              className="w-full border-0 bg-transparent p-0 text-center font-mono text-[15px] tabular focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              className="px-3.5 py-3 text-lg font-bold text-mist-700 hover:text-carbon-900"
              aria-label="Menge erhöhen"
            >
              +
            </button>
          </div>
        </div>
        <SubmitButton disabled={disabled} />
      </div>

      {state.message && (
        <p className={`mt-3 text-sm ${state.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
