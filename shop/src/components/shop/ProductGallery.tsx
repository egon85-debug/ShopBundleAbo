"use client";

import { useState } from "react";

type GalleryImage = { url: string; alt: string };

/** Bildergalerie mit optionalem Video und 3D-Ansicht (lazy geladen). */
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

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-mist-200 bg-mist-100">
        {mode === "image" && active && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.url} alt={active.alt} className="h-full w-full object-cover" />
        )}
        {mode === "image" && !active && (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs tracking-widest text-mist-500">KEIN BILD HINTERLEGT</span>
          </div>
        )}
        {mode === "video" && videoUrl && (
          <video src={videoUrl} controls playsInline className="h-full w-full object-cover" aria-label={`Video zu ${productName}`} />
        )}
        {mode === "3d" && model3dUrl && (
          <iframe
            src={model3dUrl}
            title={`3D-Ansicht von ${productName}`}
            loading="lazy"
            className="h-full w-full border-0"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {images.map((image, index) => (
          <button
            key={image.url}
            type="button"
            onClick={() => {
              setActiveIndex(index);
              setMode("image");
            }}
            aria-label={`Bild ${index + 1} anzeigen`}
            aria-pressed={mode === "image" && activeIndex === index}
            className={`h-20 w-20 overflow-hidden rounded-xl border-2 transition-colors ${
              mode === "image" && activeIndex === index ? "border-signal-500" : "border-mist-200 hover:border-mist-300"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}

        {videoUrl && (
          <button
            type="button"
            onClick={() => setMode("video")}
            aria-pressed={mode === "video"}
            className={`h-20 w-20 rounded-xl border-2 font-display text-xs font-bold transition-colors ${
              mode === "video" ? "border-signal-500 text-signal-600" : "border-mist-200 hover:border-mist-300"
            }`}
          >
            VIDEO
          </button>
        )}
        {model3dUrl && (
          <button
            type="button"
            onClick={() => setMode("3d")}
            aria-pressed={mode === "3d"}
            className={`h-20 w-20 rounded-xl border-2 font-display text-xs font-bold transition-colors ${
              mode === "3d" ? "border-signal-500 text-signal-600" : "border-mist-200 hover:border-mist-300"
            }`}
          >
            3D
          </button>
        )}
      </div>
    </div>
  );
}
