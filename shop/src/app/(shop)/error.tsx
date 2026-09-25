"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Ueberschrift } from "@/components/ui/Gestaltung";

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
    <div className="seite py-20 lg:py-28">
      <div className="mx-auto max-w-xl text-center">
        <Ueberschrift als="h1" groesse="gross" mitte augenbraue="Vorübergehend nicht verfügbar">
          Dieser Bereich lädt gerade nicht
        </Ueberschrift>
        <p className="mt-6 text-kohle">
          Der Shop konnte die angeforderten Daten nicht abrufen. Das liegt an uns, nicht an Ihnen —
          bitte versuchen Sie es in einem Moment noch einmal.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="knopf-aktion">
            Erneut versuchen
          </button>
          <Link href="/" className="knopf-zweit">
            Zur Startseite
          </Link>
        </div>

        {error.digest && (
          <p className="mt-10 text-caption text-schiefer">Referenz für den Support: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
