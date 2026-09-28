"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** Wird nach dem Hinzufügen eines Artikels ausgelöst (siehe AddToCartForm). */
export const WARENKORB_GEAENDERT = "warenkorb-geaendert";

/**
 * Warenkorb-Schaltfläche oben rechts mit Artikelzähler.
 *
 * Der Zähler wird im Browser nachgeladen, damit die umgebende Seite statisch
 * ausgeliefert werden kann. Solange die Antwort aussteht (oder wenn sie
 * ausbleibt), zeigt die Schaltfläche einfach keinen Zähler – nie einen Fehler.
 */
export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();
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
        /* Zähler bleibt, wie er ist. */
      });
  }, []);

  useEffect(() => {
    laden();
    return () => abbruch.current?.abort();
  }, [laden, pathname]);

  useEffect(() => {
    // Bringt das Ereignis die neue Anzahl mit, gilt sie sofort – ohne Umweg über den Server.
    const geaendert = (event: Event) => {
      const anzahl = (event as CustomEvent<{ anzahl?: number }>).detail?.anzahl;
      if (typeof anzahl === "number") {
        abbruch.current?.abort();
        setCount(anzahl);
      } else {
        laden();
      }
    };
    window.addEventListener(WARENKORB_GEAENDERT, geaendert);
    return () => window.removeEventListener(WARENKORB_GEAENDERT, geaendert);
  }, [laden]);

  return (
    <Link href="/warenkorb" className="knopf-nav" aria-label={`Warenkorb${count ? `, ${count} Artikel` : ""}`}>
      Warenkorb
      {count !== null && count > 0 && (
        <span className="tabular rounded-klein bg-white/25 px-1.5 text-caption">{count}</span>
      )}
    </Link>
  );
}
