"use client";

import type { ReactNode } from "react";

import { useInView } from "./useInView";

/**
 * Bausteine fuer Scroll-Reveals.
 *
 * Ein Element soll nicht einfach erscheinen, sondern sich entwickeln – aus
 * einer Maske heraus, aus der Unschaerfe, aus der Tiefe. Alle Varianten teilen
 * sich dieselbe Kurve (siehe globals.css), damit die Seite einen einheitlichen
 * Rhythmus behaelt.
 *
 * Umgesetzt mit einem IntersectionObserver und CSS-Uebergaengen statt mit einer
 * Animationsbibliothek: das Verhalten ist dasselbe, kostet aber kein zusaetzliches
 * JavaScript im Bundle. Bei reduzierter Bewegung schaltet die CSS-Regel alle
 * Uebergaenge ab – dann steht alles sofort da.
 */
export type RevealArt = "aufsteigen" | "maske" | "schaerfen" | "naeher" | "seitlich";

export function Reveal({
  children,
  art = "aufsteigen",
  verzoegerung = 0,
  className,
  as: Element = "div",
}: {
  children: ReactNode;
  art?: RevealArt;
  /** Verzoegerung in Sekunden. */
  verzoegerung?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const { ref, sichtbar } = useInView<HTMLDivElement>();

  return (
    <Element
      ref={ref as React.Ref<never>}
      className={["reveal", `reveal--${art}`, sichtbar ? "ist-sichtbar" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={verzoegerung ? { transitionDelay: `${verzoegerung}s` } : undefined}
    >
      {children}
    </Element>
  );
}

/**
 * Ueberschrift, die Wort fuer Wort erscheint. Der Zeilenumbruch bleibt der des
 * Browsers – die Woerter sind nur einzeln animiert, nicht einzeln positioniert.
 */
export function TextReveal({
  text,
  className,
  verzoegerung = 0,
  abstand = 0.055,
}: {
  text: string;
  className?: string;
  verzoegerung?: number;
  abstand?: number;
}) {
  const { ref, sichtbar } = useInView<HTMLSpanElement>("0px 0px -10% 0px");
  const woerter = text.split(" ");

  return (
    <span ref={ref} className={className} aria-label={text}>
      {woerter.map((wort, index) => (
        <span key={`${wort}-${index}`} className="wortmaske" aria-hidden>
          <span
            className={`wort ${sichtbar ? "ist-sichtbar" : ""}`}
            style={{ transitionDelay: `${verzoegerung + index * abstand}s` }}
          >
            {wort}
            {index < woerter.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
