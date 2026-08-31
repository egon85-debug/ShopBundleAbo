"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { WARENKORB_EREIGNIS } from "@/components/motion/cart-flight";
import { reduzierteBewegung } from "@/components/motion/useInView";

/**
 * Warenkorb-Schaltflaeche mit Artikelzaehler.
 *
 * Der Zaehler wird im Browser nachgeladen, damit die umgebende Seite statisch
 * ausgeliefert werden kann. Solange die Antwort aussteht (oder wenn sie
 * ausbleibt), zeigt die Schaltflaeche einfach keinen Zaehler – nie einen
 * Fehler.
 *
 * Das Attribut `data-warenkorb` ist das Ziel des Flugs aus
 * `cart-flight.ts`; darueber findet die Animation den Warenkorb, ohne dass
 * beide Seiten voneinander wissen muessen.
 */
export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();
  const huelle = useRef<HTMLSpanElement>(null);
  const abbruch = useRef<AbortController | null>(null);

  const laden = useCallback(() => {
    abbruch.current?.abort();
    const controller = new AbortController();
    abbruch.current = controller;
    fetch("/api/warenkorb/anzahl", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.anzahl === "number") setCount(data.anzahl);
      })
      .catch(() => {
        /* Zaehler bleibt, wie er ist. */
      });
  }, []);

  useEffect(() => {
    laden();
    return () => abbruch.current?.abort();
  }, [laden, pathname]);

  // Nach dem Hinzufuegen eines Produkts: neu laden und kurz reagieren.
  useEffect(() => {
    const aufAenderung = () => {
      laden();
      // Kurzer Impuls, wenn das Paket ankommt – ueber die Web-Animations-API,
      // damit dafuer keine Bibliothek noetig ist.
      if (!reduzierteBewegung()) {
        huelle.current?.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.09)" }, { transform: "scale(1)" }],
          { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      }
    };
    window.addEventListener(WARENKORB_EREIGNIS, aufAenderung);
    return () => window.removeEventListener(WARENKORB_EREIGNIS, aufAenderung);
  }, [laden]);

  return (
    <span ref={huelle} style={{ display: "inline-block" }}>
      <Link
        href="/warenkorb"
        data-warenkorb
        className="relative rounded-lg bg-carbon-900 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-carbon-800"
      >
        Warenkorb
        {count !== null && count > 0 && (
          <span
            key={count}
            className="zaehler-eintritt ml-2 inline-block rounded-full bg-signal-500 px-2 py-0.5 font-mono text-xs tabular"
          >
            {count}
          </span>
        )}
      </Link>
    </span>
  );
}
