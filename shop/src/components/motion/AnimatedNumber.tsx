"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Zahl, die beim Erscheinen einmal hochzaehlt.
 *
 * Nur beim ersten Sichtbarwerden, nicht bei jedem Vorbeiscrollen – ein Preis,
 * der staendig zappelt, wirkt unserioes. Der Endwert steht sofort im DOM
 * (`aria-label`), damit Vorlesesoftware nicht die Zwischenschritte ansagt.
 */
export function AnimatedNumber({
  wert,
  formatieren,
  dauer = 0.9,
  className,
}: {
  wert: number;
  formatieren: (wert: number) => string;
  dauer?: number;
  className?: string;
}) {
  const reduziert = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const sichtbar = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const [anzeige, setAnzeige] = useState(() => (reduziert ? wert : 0));

  useEffect(() => {
    if (reduziert) {
      setAnzeige(wert);
      return;
    }
    if (!sichtbar) return;
    const lauf = animate(0, wert, {
      duration: dauer,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (aktuell) => setAnzeige(aktuell),
    });
    return () => lauf.stop();
  }, [sichtbar, wert, dauer, reduziert]);

  return (
    <span ref={ref} className={className} aria-label={formatieren(wert)}>
      <span aria-hidden>{formatieren(anzeige)}</span>
    </span>
  );
}
