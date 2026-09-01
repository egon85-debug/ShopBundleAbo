"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Weiches Scrollen fuer den Shop.
 *
 * Lenis faengt das Mausrad ab und interpoliert die Scrollposition – das ist
 * die Grundlage dafuer, dass Kamerafahrten und Reveals nicht ruckeln.
 *
 * Bewusst zurueckhaltend eingerichtet:
 *  - Wer reduzierte Bewegung eingestellt hat, bekommt natives Scrollen. Weiches
 *    Scrollen ist genau die Art von Bewegung, die dabei stoert.
 *  - Auf Touchgeraeten bleibt das native Scrollen aktiv (`syncTouch: false`):
 *    der Finger soll sich anfuehlen wie im Betriebssystem, nicht wie eine
 *    Nachbildung davon.
 *  - Aendert sich die Einstellung waehrend des Besuchs, wird sie sofort
 *    beruecksichtigt.
 */
export function SmoothScroll() {
  useEffect(() => {
    const abfrage = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;
    let rahmen = 0;

    const starten = () => {
      if (lenis || abfrage.matches) return;
      lenis = new Lenis({
        duration: 1.05,
        // Sanftes Auslaufen statt Nachfedern – seriös, nicht verspielt.
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        syncTouch: false,
      });
      const takt = (zeit: number) => {
        lenis?.raf(zeit);
        rahmen = requestAnimationFrame(takt);
      };
      rahmen = requestAnimationFrame(takt);
    };

    const beenden = () => {
      cancelAnimationFrame(rahmen);
      lenis?.destroy();
      lenis = null;
    };

    const aufAenderung = () => (abfrage.matches ? beenden() : starten());

    starten();
    abfrage.addEventListener("change", aufAenderung);
    return () => {
      abfrage.removeEventListener("change", aufAenderung);
      beenden();
    };
  }, []);

  return null;
}
