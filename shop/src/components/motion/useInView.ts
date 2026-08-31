"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Meldet, sobald ein Element zum ersten Mal ins Bild kommt.
 *
 * Bewusst schlank gehalten: ein IntersectionObserver reicht fuer alles, was
 * der Shop an Scroll-Animationen braucht. Der Beobachter wird nach dem ersten
 * Treffer abgeschaltet – ein Element, das schon erschienen ist, muss nicht
 * weiter beobachtet werden.
 */
export function useInView<T extends HTMLElement>(rand = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || sichtbar) return;

    // Ohne IntersectionObserver (sehr alte Browser) sofort zeigen statt
    // dauerhaft zu verbergen.
    if (typeof IntersectionObserver === "undefined") {
      setSichtbar(true);
      return;
    }

    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((eintrag) => eintrag.isIntersecting)) {
          setSichtbar(true);
          beobachter.disconnect();
        }
      },
      { rootMargin: rand },
    );
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [rand, sichtbar]);

  return { ref, sichtbar };
}

/** Wuenscht die Nutzerin reduzierte Bewegung? */
export function reduzierteBewegung(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
