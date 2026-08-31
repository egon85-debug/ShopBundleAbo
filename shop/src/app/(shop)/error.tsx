"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Auffangnetz für den Storefront-Bereich.
 *
 * Fällt eine Abfrage aus (etwa weil die Datenbank nicht erreichbar ist), zeigt
 * der Shop eine erklärende Seite mit Auswegen statt einer nackten 500er-Antwort.
 * Kaufinteressierte sollen sehen, dass es am Shop liegt und nicht an ihnen.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Damit der Vorfall in den Server-Logs auffindbar bleibt.
    console.error("Storefront-Fehler:", error);
  }, [error]);

  return (
    <div className="section py-20">
      <div className="card mx-auto max-w-xl p-10 text-center">
        <p className="eyebrow">Vorübergehend nicht verfügbar</p>
        <h1 className="mt-3 font-display text-display-md font-extrabold">
          Dieser Bereich lädt gerade nicht
        </h1>
        <p className="mt-4 text-mist-700">
          Der Shop konnte die angeforderten Daten nicht abrufen. Das liegt an uns, nicht an Ihnen —
          bitte versuchen Sie es in einem Moment noch einmal.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Erneut versuchen
          </button>
          <Link href="/" className="btn-ghost">
            Zur Startseite
          </Link>
        </div>

        {error.digest && (
          <p className="mt-8 font-mono text-xs text-mist-500">
            Referenz für den Support: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
