"use client";

import { useEffect, useRef } from "react";

import { reduzierteBewegung, useInView } from "./useInView";

/**
 * Zahl, die beim Erscheinen einmal hochzaehlt.
 *
 * Nur beim ersten Sichtbarwerden, nicht bei jedem Vorbeiscrollen – ein Preis,
 * der staendig zappelt, wirkt unserioes.
 *
 * Der Zwischenstand wird direkt in den Textknoten geschrieben, nicht ueber
 * React-Zustand: sonst rendert die Seite waehrend der knappen Sekunde
 * sechzigmal neu. Der Endwert steht ueber `aria-label` von Anfang an fest,
 * damit Vorlesesoftware nicht die Zwischenschritte ansagt.
 */
export function AnimatedNumber({
  wert,
  formatieren,
  dauer = 900,
  className,
}: {
  wert: number;
  formatieren: (wert: number) => string;
  /** Dauer in Millisekunden. */
  dauer?: number;
  className?: string;
}) {
  const { ref, sichtbar } = useInView<HTMLSpanElement>("0px 0px -8% 0px");
  const anzeige = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ziel = anzeige.current;
    if (!ziel) return;

    if (reduzierteBewegung() || !sichtbar) {
      if (reduzierteBewegung()) ziel.textContent = formatieren(wert);
      return;
    }

    let rahmen = 0;
    const start = performance.now();
    const takt = (jetzt: number) => {
      const anteil = Math.min(1, (jetzt - start) / dauer);
      // Dieselbe Kurve wie alle anderen Bewegungen der Seite.
      const weich = 1 - Math.pow(1 - anteil, 3);
      ziel.textContent = formatieren(wert * weich);
      if (anteil < 1) rahmen = requestAnimationFrame(takt);
    };
    rahmen = requestAnimationFrame(takt);
    return () => cancelAnimationFrame(rahmen);
  }, [sichtbar, wert, dauer, formatieren]);

  return (
    <span ref={ref} className={className} aria-label={formatieren(wert)}>
      {/* Startwert steht schon im Markup: ohne JavaScript bleibt der Preis lesbar. */}
      <span ref={anzeige} aria-hidden>
        {formatieren(wert)}
      </span>
    </span>
  );
}
