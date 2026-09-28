"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Hält die Warenkorbseite aktuell.
 *
 * Kommt die Seite aus dem Zwischenspeicher des Browsers (z. B. über „Zurück“),
 * kann sie einen älteren Stand zeigen als der Zähler oben. Weicht die Anzahl
 * vom Server ab, wird die Seite einmal frisch geladen.
 */
export function WarenkorbAbgleich({ anzahl }: { anzahl: number }) {
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/warenkorb/anzahl", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.anzahl === "number" && data.anzahl !== anzahl) router.refresh();
      })
      .catch(() => {
        /* Abgleich ist nur eine Absicherung. */
      });
    return () => controller.abort();
  }, [anzahl, router]);

  return null;
}
