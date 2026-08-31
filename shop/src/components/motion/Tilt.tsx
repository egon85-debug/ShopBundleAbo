"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * Perspektivische Tiefe fuer Karten.
 *
 * Die Karte neigt sich leicht zum Zeiger und bekommt einen wandernden
 * Lichtschein. Der Ausschlag ist klein gehalten: eine Produktkarte soll
 * greifbar wirken, nicht wackeln.
 *
 * Die Werte werden als CSS-Variablen direkt auf das Element geschrieben – kein
 * React-Zustand, also kein Rendern bei jeder Mausbewegung. Bei reduzierter
 * Bewegung und auf Touchgeraeten passiert nichts; dort gibt es kein Schweben
 * und der Effekt waere nur ein Ruckeln unter dem Finger.
 */
export function Tilt({
  children,
  neigung = 5,
  className,
}: {
  children: ReactNode;
  /** Groesster Ausschlag in Grad. */
  neigung?: number;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);

  const bewegen = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || !element.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const feld = element.current.getBoundingClientRect();
      const x = (event.clientX - feld.left) / feld.width;
      const y = (event.clientY - feld.top) / feld.height;

      const stil = element.current.style;
      stil.setProperty("--neigung-y", `${(x - 0.5) * 2 * neigung}deg`);
      stil.setProperty("--neigung-x", `${(0.5 - y) * 2 * neigung}deg`);
      stil.setProperty("--schein-x", `${x * 100}%`);
      stil.setProperty("--schein-y", `${y * 100}%`);
      stil.setProperty("--schein-staerke", "1");
    },
    [neigung],
  );

  const zuruecksetzen = useCallback(() => {
    const stil = element.current?.style;
    if (!stil) return;
    stil.setProperty("--neigung-y", "0deg");
    stil.setProperty("--neigung-x", "0deg");
    stil.setProperty("--schein-staerke", "0");
  }, []);

  return (
    <div
      ref={element}
      onPointerMove={bewegen}
      onPointerLeave={zuruecksetzen}
      className={["neigekarte", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
