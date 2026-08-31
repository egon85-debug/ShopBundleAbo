"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Bausteine fuer Scroll-Reveals.
 *
 * Ein Element soll nicht einfach erscheinen, sondern sich entwickeln – aus
 * einer Maske heraus, aus der Unschaerfe, aus der Tiefe. Alle Varianten teilen
 * sich dieselbe Kurve, damit die Seite einen einheitlichen Rhythmus behaelt.
 *
 * Bei reduzierter Bewegung erscheint alles sofort und vollstaendig: kein
 * Versatz, keine Unschaerfe, keine Verzoegerung.
 */
export type RevealArt = "aufsteigen" | "maske" | "schaerfen" | "naeher" | "seitlich";

const KURVE = [0.22, 1, 0.36, 1] as const;

const varianten: Record<RevealArt, Variants> = {
  aufsteigen: {
    ruhe: { opacity: 0, y: 26 },
    sichtbar: { opacity: 1, y: 0 },
  },
  maske: {
    ruhe: { opacity: 0, clipPath: "inset(0 0 100% 0)", y: 12 },
    sichtbar: { opacity: 1, clipPath: "inset(0 0 0% 0)", y: 0 },
  },
  schaerfen: {
    ruhe: { opacity: 0, filter: "blur(14px)", scale: 1.015 },
    sichtbar: { opacity: 1, filter: "blur(0px)", scale: 1 },
  },
  naeher: {
    ruhe: { opacity: 0, scale: 0.94 },
    sichtbar: { opacity: 1, scale: 1 },
  },
  seitlich: {
    ruhe: { opacity: 0, x: -34 },
    sichtbar: { opacity: 1, x: 0 },
  },
};

export function Reveal({
  children,
  art = "aufsteigen",
  verzoegerung = 0,
  dauer = 0.72,
  className,
  as = "div",
}: {
  children: ReactNode;
  art?: RevealArt;
  verzoegerung?: number;
  dauer?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduziert = useReducedMotion();
  const Komponente = motion[as];

  if (reduziert) {
    const Statisch = as;
    return <Statisch className={className}>{children}</Statisch>;
  }

  return (
    <Komponente
      className={className}
      variants={varianten[art]}
      initial="ruhe"
      whileInView="sichtbar"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: dauer, delay: verzoegerung, ease: KURVE }}
    >
      {children}
    </Komponente>
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
  const reduziert = useReducedMotion();
  if (reduziert) return <span className={className}>{text}</span>;

  const woerter = text.split(" ");

  return (
    <motion.span
      className={className}
      initial="ruhe"
      whileInView="sichtbar"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ staggerChildren: abstand, delayChildren: verzoegerung }}
      aria-label={text}
    >
      {woerter.map((wort, index) => (
        <span
          key={`${wort}-${index}`}
          className="inline-block overflow-hidden align-bottom"
          aria-hidden
        >
          <motion.span
            className="inline-block"
            variants={{
              ruhe: { y: "108%", opacity: 0 },
              sichtbar: { y: "0%", opacity: 1 },
            }}
            transition={{ duration: 0.68, ease: KURVE }}
          >
            {wort}
            {index < woerter.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
