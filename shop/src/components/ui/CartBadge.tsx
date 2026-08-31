"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Warenkorb-Schaltflaeche mit Artikelzaehler.
 *
 * Der Zaehler wird im Browser nachgeladen, damit die umgebende Seite statisch
 * ausgeliefert werden kann. Solange die Antwort aussteht (oder wenn sie
 * ausbleibt), zeigt die Schaltflaeche einfach keinen Zaehler – nie einen
 * Fehler.
 */
export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/warenkorb/anzahl", { signal: abort.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.anzahl === "number") setCount(data.anzahl);
      })
      .catch(() => {
        /* Zaehler bleibt verborgen. */
      });
    return () => abort.abort();
  }, [pathname]);

  return (
    <Link
      href="/warenkorb"
      className="relative rounded-lg bg-carbon-900 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-carbon-800"
    >
      Warenkorb
      {count !== null && count > 0 && (
        <span className="ml-2 rounded-full bg-signal-500 px-2 py-0.5 font-mono text-xs tabular">
          {count}
        </span>
      )}
    </Link>
  );
}
