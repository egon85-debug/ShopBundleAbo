"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { reduzierteBewegung } from "./useInView";

/**
 * Element, das dem Zeiger ein Stueck entgegenkommt.
 *
 * Der Ausschlag ist absichtlich klein: der Knopf soll aufmerksam wirken, nicht
 * ausweichen. Ein zu grosser Weg macht das Treffen schwerer statt leichter –
 * die Flaeche selbst bewegt sich ja mit.
 *
 * Die Bewegung laeuft ueber ein weiches Nachziehen je Bild, direkt auf dem
 * Transform des Elements. Kein React-Zustand, keine Bibliothek.
 *
 * Nur fuer Zeigergeraete: auf Touch gibt es kein Schweben, und ein Versatz
 * unter dem Finger waere nur stoerend.
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
  const huelle = useRef<HTMLSpanElement>(null);
  const ziel = useRef({ x: 0, y: 0 });
  const jetzt = useRef({ x: 0, y: 0 });
  const rahmen = useRef(0);

  const takt = useCallback(() => {
    const element = huelle.current;
    if (!element) return;
    jetzt.current.x += (ziel.current.x - jetzt.current.x) * 0.18;
    jetzt.current.y += (ziel.current.y - jetzt.current.y) * 0.18;
    element.style.transform = `translate3d(${jetzt.current.x.toFixed(2)}px, ${jetzt.current.y.toFixed(2)}px, 0)`;

    const ruht =
      Math.abs(ziel.current.x - jetzt.current.x) < 0.05 &&
      Math.abs(ziel.current.y - jetzt.current.y) < 0.05;
    if (ruht && ziel.current.x === 0 && ziel.current.y === 0) {
      // Angekommen und in Ruhelage: Schleife anhalten, bis wieder etwas passiert.
      element.style.transform = "";
      rahmen.current = 0;
      return;
    }
    rahmen.current = requestAnimationFrame(takt);
  }, []);

  const anstossen = useCallback(() => {
    if (!rahmen.current) rahmen.current = requestAnimationFrame(takt);
  }, [takt]);

  useEffect(() => () => cancelAnimationFrame(rahmen.current), []);

  const bewegen = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "mouse" || !huelle.current || reduzierteBewegung()) return;
    const feld = huelle.current.getBoundingClientRect();
    const dx = event.clientX - (feld.left + feld.width / 2);
    const dy = event.clientY - (feld.top + feld.height / 2);
    const abstand = Math.hypot(dx, dy);
    const daempfung = Math.max(0, 1 - abstand / (radius + Math.max(feld.width, feld.height)));
    ziel.current.x = dx * staerke * daempfung;
    ziel.current.y = dy * staerke * daempfung;
    anstossen();
  };

  const loslassen = () => {
    ziel.current.x = 0;
    ziel.current.y = 0;
    anstossen();
  };

  return (
    <span
      ref={huelle}
      className={className}
      style={{ display: "inline-block", willChange: "transform" }}
      onPointerMove={bewegen}
      onPointerLeave={loslassen}
    >
      {children}
    </span>
  );
}
