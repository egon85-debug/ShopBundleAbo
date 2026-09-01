"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Das Signature-Element: eine feine Route, die sich durch die Seite zieht.
 *
 * Ein Paket wandert beim Scrollen an einer feinen Linie entlang. Sie liegt am
 * linken Rand, nimmt keine Breite vom Inhalt und verschwindet auf schmalen
 * Bildschirmen ganz – dort waere sie nur im Weg.
 *
 * Sie ist reine Zier: fuer Vorlesesoftware unsichtbar, ohne Klickflaeche.
 */
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

      {/* Bewusst ohne Beschriftung: der Stationsname stand neben der Linie und
          lief in die Rubriken der Abschnitte hinein ("KOMMISSIONIERUNG" lag
          ueber "WAS DRIN IST"). Linie und wanderndes Paket tragen das Element
          auch allein; die Stationen stehen ohnehin im Abschnitt "Der Weg Ihrer
          Sendung". */}
    </div>
  );
}
