"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type MenueKategorie = { id: string; name: string; slug: string; kinder: MenueKategorie[] };

/**
 * Aufklappbares Kategorien-Menü links in der Kopfzeile. Die Leiste hatte nur
 * Platz für vier Kategorien; hier stehen alle mit ihren Unterkategorien.
 * Auf schmaleren Bildschirmen liegen Suche (und am Handy das Konto) mit im
 * Menü, weil die Kopfzeile dort für Menü, Logo und Warenkorb gebraucht wird.
 *
 * Schließt bei Escape, Klick daneben und Seitenwechsel.
 */
export function KategorienMenue({ kategorien }: { kategorien: MenueKategorie[] }) {
  const [offen, setOffen] = useState(false);
  const pathname = usePathname();
  const bereich = useRef<HTMLDivElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => setOffen(false), [pathname]);

  useEffect(() => {
    if (!offen) return;
    const taste = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOffen(false);
        knopf.current?.focus();
      }
    };
    const klick = (event: MouseEvent) => {
      if (!bereich.current?.contains(event.target as Node)) setOffen(false);
    };
    document.addEventListener("keydown", taste);
    document.addEventListener("mousedown", klick);
    return () => {
      document.removeEventListener("keydown", taste);
      document.removeEventListener("mousedown", klick);
    };
  }, [offen]);

  const schliessen = () => setOffen(false);

  return (
    <div ref={bereich}>
      <button
        ref={knopf}
        type="button"
        onClick={() => setOffen((wert) => !wert)}
        aria-expanded={offen}
        aria-controls={panelId}
        className="inline-flex items-center gap-2.5 rounded-nav border border-haarlinie bg-white px-3 py-2.5
                   text-body-sm text-kohle transition-colors duration-200 hover:bg-leinen sm:px-4"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
          {offen ? (
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          ) : (
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </svg>
        <span className="sr-only sm:not-sr-only">Kategorien</span>
      </button>

      <div
        id={panelId}
        hidden={!offen}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-haarlinie bg-white"
      >
        <div className="seite py-6 lg:py-10">
          {/* Was in der Kopfzeile keinen Platz hat: Suche unter 1280 px, Konto unter 768 px. */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 xl:hidden">
            <form action="/shop" role="search" className="sm:w-80">
              <input type="search" name="q" placeholder="Suchen …" aria-label="Produkte suchen" className="feld py-2.5 text-body-sm" />
            </form>
            <Link href="/konto" onClick={schliessen} className="text-body-sm text-kohle hover:text-tinte md:hidden">
              Mein Konto
            </Link>
          </div>

          <Link href="/shop" onClick={schliessen} className="textlink text-body">
            Alle Produkte ansehen →
          </Link>

          <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {kategorien.map((kategorie) => (
              <li key={kategorie.id}>
                <Link
                  href={`/shop/${kategorie.slug}`}
                  onClick={schliessen}
                  className="text-body font-medium text-tinte underline-offset-4 hover:underline"
                >
                  {kategorie.name}
                </Link>
                {kategorie.kinder.length > 0 && (
                  <ul className="mt-3 space-y-2 border-l border-haarlinie pl-4">
                    {kategorie.kinder.map((kind) => (
                      <li key={kind.id}>
                        <Link
                          href={`/shop/${kind.slug}`}
                          onClick={schliessen}
                          className="text-body-sm text-kohle hover:text-tinte"
                        >
                          {kind.name}
                        </Link>
                        {kind.kinder.length > 0 && (
                          <ul className="mt-2 space-y-1.5 pl-3">
                            {kind.kinder.map((enkel) => (
                              <li key={enkel.id}>
                                <Link
                                  href={`/shop/${enkel.slug}`}
                                  onClick={schliessen}
                                  className="text-body-sm text-schiefer hover:text-tinte"
                                >
                                  {enkel.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
