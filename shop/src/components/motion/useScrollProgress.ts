"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Fortschritt beim Durchscrollen eines Abschnitts, als Wert von 0 bis 1.
 *
 * Das Ergebnis liegt in einer Referenz, nicht im React-Zustand: eine
 * Kamerafahrt liest den Wert je Bild in `useFrame` – ginge er durch React,
 * wuerde die Seite beim Scrollen sechzigmal pro Sekunde neu rendern.
 *
 * Wer zusaetzlich auf Abschnittswechsel reagieren muss (Beschriftungen etwa),
 * bekommt sie ueber `beiStation` gemeldet – und zwar nur beim Wechsel.
 */
export function useScrollProgress<T extends HTMLElement>({
  stationen = 0,
  beiStation,
}: {
  /** Anzahl gleich grosser Abschnitte, ueber die gemeldet werden soll. */
  stationen?: number;
  beiStation?: (index: number) => void;
} = {}): { ref: RefObject<T | null>; fortschritt: RefObject<number> } {
  const ref = useRef<T>(null);
  const fortschritt = useRef(0);
  const letzteStation = useRef(-1);
  const rueckruf = useRef(beiStation);
  rueckruf.current = beiStation;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let rahmen = 0;
    const messen = () => {
      rahmen = 0;
      const feld = element.getBoundingClientRect();
      const weg = feld.height - window.innerHeight;
      const roh = weg > 0 ? -feld.top / weg : 0;
      const wert = Math.min(Math.max(roh, 0), 1);
      fortschritt.current = wert;

      if (stationen > 0) {
        const index = Math.min(stationen - 1, Math.floor(wert * stationen));
        if (index !== letzteStation.current) {
          letzteStation.current = index;
          rueckruf.current?.(index);
        }
      }
    };

    // Scroll-Ereignisse auf ein Bild drosseln.
    const beiScroll = () => {
      if (!rahmen) rahmen = requestAnimationFrame(messen);
    };

    messen();
    window.addEventListener("scroll", beiScroll, { passive: true });
    window.addEventListener("resize", beiScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", beiScroll);
      window.removeEventListener("resize", beiScroll);
      if (rahmen) cancelAnimationFrame(rahmen);
    };
  }, [stationen]);

  return { ref, fortschritt };
}
