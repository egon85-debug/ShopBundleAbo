"use client";

import { useState } from "react";

import { ProduktBild } from "@/components/ui/Gestaltung";

type GalleryImage = { url: string; alt: string };

/** Bildergalerie mit optionalem Video und eingebetteter 3D-Ansicht des Herstellers. */
export function ProductGallery({
  images,
  videoUrl,
  model3dUrl,
  productName,
}: {
  images: GalleryImage[];
  videoUrl?: string | null;
  model3dUrl?: string | null;
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<"image" | "video" | "3d">("image");

  const active = images[activeIndex];
  const hatAuswahl = images.length > 1 || videoUrl || model3dUrl;

  return (
    <div>
      {mode === "image" && (
        <ProduktBild url={active?.url} alt={active?.alt ?? productName} className="aspect-square" />
      )}
      {mode === "video" && videoUrl && (
        <video
          src={videoUrl}
          controls
          playsInline
          className="aspect-square w-full rounded-bild bg-leinen object-contain"
          aria-label={`Video zu ${productName}`}
        />
      )}
      {mode === "3d" && model3dUrl && (
        <iframe
          src={model3dUrl}
          title={`3D-Ansicht von ${productName}`}
          loading="lazy"
          className="aspect-square w-full rounded-bild border-0 bg-leinen"
        />
      )}

      {hatAuswahl && (
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((image, index) => {
            const gewaehlt = mode === "image" && activeIndex === index;
            return (
              <button
                key={image.url}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setMode("image");
                }}
                aria-label={`Bild ${index + 1} anzeigen`}
                aria-pressed={gewaehlt}
                className={`rounded-bild border-2 p-0.5 transition-colors ${gewaehlt ? "border-tinte" : "border-transparent hover:border-haarlinie"}`}
              >
                <ProduktBild url={image.url} alt="" klein className="h-16 w-16" />
              </button>
            );
          })}
          {videoUrl && (
            <button
              type="button"
              onClick={() => setMode("video")}
              aria-pressed={mode === "video"}
              className={`knopf-klein h-[68px] w-[68px] ${mode === "video" ? "border-tinte text-tinte" : ""}`}
            >
              Video
            </button>
          )}
          {model3dUrl && (
            <button
              type="button"
              onClick={() => setMode("3d")}
              aria-pressed={mode === "3d"}
              className={`knopf-klein h-[68px] w-[68px] ${mode === "3d" ? "border-tinte text-tinte" : ""}`}
            >
              3D
            </button>
          )}
        </div>
      )}
    </div>
  );
}
