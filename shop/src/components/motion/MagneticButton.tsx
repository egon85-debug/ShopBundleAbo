"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Element, das dem Zeiger ein Stueck entgegenkommt.
 *
 * Der Ausschlag ist absichtlich klein: der Knopf soll aufmerksam wirken, nicht
 * ausweichen. Ein zu grosser Weg macht das Treffen schwerer statt leichter –
 * die Flaeche selbst bewegt sich ja mit.
 *
 * Nur fuer Zeigergeraete: auf Touch gibt es kein Schweben, und ein Versatz
 * unter dem Finger waere nur stoerend. Bei reduzierter Bewegung passiert nichts.
 */
export function Magnetic({
  children,
  staerke = 0.28,
  radius = 90,
  className,
}: {
  children: ReactNode;
  staerke?: number;
  radius?: number;
  className?: string;
}) {
  const reduziert = useReducedMotion();
  const huelle = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const federX = useSpring(x, { stiffness: 260, damping: 22, mass: 0.5 });
  const federY = useSpring(y, { stiffness: 260, damping: 22, mass: 0.5 });

  if (reduziert) return <span className={className}>{children}</span>;

  const bewegen = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "mouse" || !huelle.current) return;
    const feld = huelle.current.getBoundingClientRect();
    const dx = event.clientX - (feld.left + feld.width / 2);
    const dy = event.clientY - (feld.top + feld.height / 2);
    const abstand = Math.hypot(dx, dy);
    const daempfung = Math.max(0, 1 - abstand / (radius + Math.max(feld.width, feld.height)));
    x.set(dx * staerke * daempfung);
    y.set(dy * staerke * daempfung);
  };

  const loslassen = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={huelle}
      className={className}
      style={{ x: federX, y: federY, display: "inline-block" }}
      onPointerMove={bewegen}
      onPointerLeave={loslassen}
    >
      {children}
    </motion.span>
  );
}
