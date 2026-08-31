"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Das Signature-Element: eine feine Route, die sich durch die Seite zieht.
 *
 * Ein Paket wandert beim Scrollen die Stationen entlang, die eine Sendung im
 * Haus durchlaeuft. Die Linie liegt am linken Rand, nimmt keine Breite vom
 * Inhalt und verschwindet auf schmalen Bildschirmen ganz – dort waere sie nur
 * im Weg.
 *
 * Sie ist reine Zier: fuer Vorlesesoftware unsichtbar, ohne Klickflaeche.
 */
const STATIONEN = ["Bestellung", "Kommissionierung", "DHL", "Transport", "Zustellung"] as const;

export function Paketroute() {
  const [anteil, setAnteil] = useState(0);
  const rahmen = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const messen = () => {
      rahmen.current = 0;
      const weg = document.documentElement.scrollHeight - window.innerHeight;
      setAnteil(weg > 0 ? Math.min(1, Math.max(0, window.scrollY / weg)) : 0);
    };
    const beiScroll = () => {
      if (!rahmen.current) rahmen.current = requestAnimationFrame(messen);
    };

    messen();
    window.addEventListener("scroll", beiScroll, { passive: true });
    window.addEventListener("resize", beiScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", beiScroll);
      window.removeEventListener("resize", beiScroll);
      if (rahmen.current) cancelAnimationFrame(rahmen.current);
    };
  }, []);

  const aktuelle = Math.min(STATIONEN.length - 1, Math.floor(anteil * STATIONEN.length));

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-5 top-0 z-40 hidden h-screen w-px xl:block"
    >
      {/* Die Route selbst – blass, damit sie nichts uebertoent. */}
      <div className="absolute inset-y-[18vh] left-0 w-px bg-mist-300/50" />
      {/* Zurueckgelegter Teil in Markenblau. */}
      <div
        className="absolute left-0 top-[18vh] w-px bg-signal-500 transition-[height] duration-150 ease-linear"
        style={{ height: `calc(${anteil * 64}vh)` }}
      />

      {/* Das Paket auf der Route. */}
      <div
        className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-[2px] bg-signal-500 shadow-[0_0_0_4px_rgba(45,111,255,.16)] transition-[top] duration-150 ease-linear"
        style={{ top: `calc(18vh + ${anteil * 64}vh)` }}
      />

      {/* Aktuelle Station, quer gestellt neben der Linie. */}
      <span
        className="absolute left-4 whitespace-nowrap font-mono text-[10px] uppercase tracking-[.18em] text-mist-500 transition-[top] duration-150 ease-linear"
        style={{ top: `calc(18vh + ${anteil * 64}vh - 6px)` }}
      >
        {STATIONEN[aktuelle]}
      </span>
    </div>
  );
}
