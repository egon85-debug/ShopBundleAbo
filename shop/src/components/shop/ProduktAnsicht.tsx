"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { ProductGallery } from "@/components/shop/ProductGallery";
import type { Kartonmasse } from "@/components/three/Carton";
import { useRenderProfile } from "@/components/three/useRenderProfile";

/**
 * Waehlt die Produktdarstellung: raeumliche Ansicht oder Fotos.
 *
 * Die raeumliche Ansicht gibt es nur, wenn das Produkt echte Masse hinterlegt
 * hat – dann steht auch wirklich der richtige Koerper da und nicht ein
 * beliebiger Platzhalter. Alles andere zeigt Fotos. Fuer Kunden mit
 * reduzierter Bewegung, ohne WebGL oder auf schwachen Geraeten bleibt es
 * ebenfalls bei den Fotos.
 *
 * Fotos sind immer erreichbar: die raeumliche Ansicht ersetzt sie nicht,
 * sondern tritt daneben.
 */
const ProductViewer = dynamic(() => import("@/components/three/ProductViewer"), {
  ssr: false,
  loading: () => (
    <div className="aspect-square animate-pulse rounded-2xl border border-mist-200 bg-mist-100" aria-hidden />
  ),
});

export function ProduktAnsicht({
  images,
  videoUrl,
  model3dUrl,
  productName,
  masse,
}: {
  images: { url: string; alt: string }[];
  videoUrl?: string | null;
  model3dUrl?: string | null;
  productName: string;
  /** Nur gesetzt, wenn das Produkt vollstaendige Masse hat. */
  masse: Kartonmasse | null;
}) {
  const profil = useRenderProfile();
  const raeumlichMoeglich = masse !== null && profil !== "off";
  const [ansicht, setAnsicht] = useState<"raeumlich" | "fotos">("raeumlich");

  if (!raeumlichMoeglich) {
    return (
      <ProductGallery
        images={images}
        videoUrl={videoUrl}
        model3dUrl={model3dUrl}
        productName={productName}
      />
    );
  }

  return (
    <div data-produkt-bereich>
      <div data-produkt-bild>
        {ansicht === "raeumlich" ? (
          <ProductViewer masse={masse!} name={productName} />
        ) : (
          <ProductGallery
            images={images}
            videoUrl={videoUrl}
            model3dUrl={model3dUrl}
            productName={productName}
          />
        )}
      </div>

      {images.length > 0 && (
        <div className="mt-3 flex gap-1 rounded-xl border border-mist-200 bg-white p-1 text-center">
          {(
            [
              ["raeumlich", "Räumlich"],
              ["fotos", "Fotos"],
            ] as const
          ).map(([wert, text]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setAnsicht(wert)}
              aria-pressed={ansicht === wert}
              className={`flex-1 rounded-lg px-3 py-2 font-display text-[13px] font-bold transition-colors ${
                ansicht === wert
                  ? "bg-mist-100 text-carbon-900"
                  : "text-mist-500 hover:bg-mist-50 hover:text-carbon-900"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
