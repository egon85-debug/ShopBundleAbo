"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatCents } from "@/lib/money";
import type { Neuheit } from "@/services/navigation";

/** Pixel pro Sekunde – ruhig genug, dass man Namen und Preise lesen kann. */
const TEMPO = 40;
/** Nach eigenem Wischen, Ziehen oder Pfeilklick läuft das Band erst danach weiter. */
const PAUSE_NACH_EINGRIFF = 3000;
/** So viele Karten braucht eine Runde mindestens, damit sie breiter ist als das Band (max. 1200 px). */
const MINDESTENS = 6;
/** In Kasse und Bestellbestätigung lenkt das Band nur ab. */
const OHNE_BAND = ["/kasse", "/bestellung"];

/**
 * Laufband mit den neuesten Artikeln unter der Hinweisleiste.
 *
 * Läuft von allein endlos durch (die Liste steht dafür zweimal hintereinander)
 * und hält an, solange die Maus darüber ist oder ein Artikel den Fokus hat.
 * Selbst bewegen: am Handy wischen, mit der Maus ziehen, per Trackpad
 * scrollen oder über die Pfeile. Der Pausenknopf hält es dauerhaft an – das
 * braucht, wer nicht mit der Maus arbeitet. Bei eingestellter reduzierter
 * Bewegung läuft es gar nicht von allein.
 */
export function NeuheitenBand({ artikel }: { artikel: Neuheit[] }) {
  const pfad = usePathname();
  const spur = useRef<HTMLDivElement>(null);
  const [angehalten, setAngehalten] = useState(false);

  // Was sich jedes Bild ändert, lebt in einer Ref statt in React-State.
  const zustand = useRef({
    position: 0,
    zuletztGesetzt: 0,
    maus: false,
    fokus: false,
    ziehen: null as null | { startX: number; startPosition: number; bewegt: boolean },
    weiterAb: 0,
    ruhig: false,
  });

  const halbeBreite = () => (spur.current ? spur.current.scrollWidth / 2 : 0);

  /** Endlosschleife: aus der zweiten Hälfte zurück in die erste und umgekehrt. */
  const einrasten = useCallback((wert: number) => {
    const halbe = halbeBreite();
    if (halbe <= 0) return wert;
    if (wert >= halbe) return wert - halbe;
    if (wert < 0) return wert + halbe;
    return wert;
  }, []);

  const setzen = useCallback(
    (wert: number) => {
      const el = spur.current;
      if (!el) return;
      const z = zustand.current;
      z.position = einrasten(wert);
      el.scrollLeft = z.position;
      z.zuletztGesetzt = el.scrollLeft;
    },
    [einrasten],
  );

  const eingriff = () => {
    zustand.current.weiterAb = performance.now() + PAUSE_NACH_EINGRIFF;
  };

  // Automatischer Lauf
  useEffect(() => {
    const z = zustand.current;
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    z.ruhig = ruhig.matches;
    const aendern = () => (z.ruhig = ruhig.matches);
    ruhig.addEventListener("change", aendern);

    let bild = 0;
    let vorher = performance.now();
    const schritt = (jetzt: number) => {
      const dt = Math.min(jetzt - vorher, 100) / 1000;
      vorher = jetzt;
      const steht = angehalten || z.ruhig || z.maus || z.fokus || z.ziehen || jetzt < z.weiterAb;
      if (!steht) setzen(z.position + TEMPO * dt);
      bild = requestAnimationFrame(schritt);
    };
    bild = requestAnimationFrame(schritt);
    return () => {
      cancelAnimationFrame(bild);
      ruhig.removeEventListener("change", aendern);
    };
  }, [angehalten, setzen]);

  // Eigenes Scrollen (Wischen, Trackpad, Pfeile) übernehmen und einrasten.
  const beimScrollen = () => {
    const el = spur.current;
    if (!el) return;
    const z = zustand.current;
    if (Math.abs(el.scrollLeft - z.zuletztGesetzt) < 2) return; // eigener Schritt
    eingriff();
    const halbe = halbeBreite();
    if (el.scrollLeft >= halbe || el.scrollLeft <= 0) setzen(el.scrollLeft);
    else z.position = z.zuletztGesetzt = el.scrollLeft;
  };

  // Mit der Maus ziehen (Touch scrollt nativ).
  const ziehenStart = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    zustand.current.ziehen = { startX: e.clientX, startPosition: zustand.current.position, bewegt: false };
  };
  const ziehenBewegen = (e: React.PointerEvent) => {
    const z = zustand.current;
    if (!z.ziehen) return;
    const dx = e.clientX - z.ziehen.startX;
    if (!z.ziehen.bewegt && Math.abs(dx) > 5) {
      z.ziehen.bewegt = true;
      spur.current?.setPointerCapture(e.pointerId);
    }
    if (z.ziehen.bewegt) setzen(z.ziehen.startPosition - dx);
  };
  const ziehenEnde = () => {
    const z = zustand.current;
    if (!z.ziehen) return;
    if (!z.ziehen.bewegt) {
      z.ziehen = null;
      return;
    }
    eingriff();
    // Erst nach dem folgenden Klick zurücksetzen – der wird unten abgefangen,
    // sonst öffnet Loslassen nach dem Ziehen einen Artikel.
    setTimeout(() => (zustand.current.ziehen = null), 0);
  };

  const blaettern = (richtung: 1 | -1) => {
    const el = spur.current;
    if (!el) return;
    eingriff();
    const karte = el.querySelector("li")?.getBoundingClientRect().width ?? 312;
    // Vor dem Zurückblättern am Anfang erst in die zweite Hälfte springen.
    if (richtung < 0 && zustand.current.position < karte) setzen(zustand.current.position + halbeBreite());
    el.scrollBy({ left: richtung * karte, behavior: "smooth" });
  };

  if (artikel.length === 0 || OHNE_BAND.some((p) => pfad.startsWith(p))) return null;

  // Eine Runde = die Artikel, bei wenigen mehrfach; die Runde steht zweimal
  // hintereinander, damit der Sprung zurück an den Anfang unsichtbar bleibt.
  // Nur der erste Durchgang ist für Tastatur und Vorleser erreichbar.
  const runde = Array.from({ length: Math.ceil(MINDESTENS / artikel.length) }, () => artikel).flat();
  const liste = (kopie: boolean) =>
    runde.map((a, i) => (
      <li key={`${kopie ? "k" : "o"}-${i}`} className="shrink-0 pr-3" aria-hidden={kopie || i >= artikel.length || undefined}>
        <Link
          href={`/produkt/${a.slug}`}
          tabIndex={kopie || i >= artikel.length ? -1 : undefined}
          draggable={false}
          title={a.name}
          className="flex w-[300px] items-center gap-3 rounded-karte border border-haarlinie bg-white p-2 pr-4 transition-colors hover:border-nebel"
        >
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-bild bg-leinen">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.bildUrl} alt="" draggable={false} loading="lazy" className="h-full w-full object-contain p-1 mix-blend-multiply" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-sm text-tinte">{a.name}</span>
            <span className="block text-body-sm font-medium tabular text-tinte">{formatCents(a.preisCents)}</span>
          </span>
        </Link>
      </li>
    ));

  return (
    <section aria-label="Neu im Shop" className="border-b border-haarlinie bg-white">
      <div className="seite flex items-center gap-4 py-3">
        <p className="augenbraue hidden shrink-0 text-kohle md:block">Neu im Shop</p>

        <div
          ref={spur}
          className="neuheiten-spur min-w-0 flex-1 cursor-grab overflow-x-auto active:cursor-grabbing"
          onScroll={beimScrollen}
          onMouseEnter={() => (zustand.current.maus = true)}
          onMouseLeave={() => {
            zustand.current.maus = false;
            ziehenEnde();
          }}
          onFocus={() => (zustand.current.fokus = true)}
          onBlur={() => (zustand.current.fokus = false)}
          onPointerDown={ziehenStart}
          onPointerMove={ziehenBewegen}
          onPointerUp={ziehenEnde}
          onPointerCancel={ziehenEnde}
          onTouchStart={eingriff}
          onClickCapture={(e) => {
            if (zustand.current.ziehen?.bewegt) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <ul className="flex w-max">
            {liste(false)}
            {liste(true)}
          </ul>
        </div>

        {/* Pfeile nur mit Maus; anhalten muss man auch am Handy können. */}
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => blaettern(-1)} className="neuheiten-knopf hidden sm:inline-flex" aria-label="Zurück">
            ←
          </button>
          <button type="button" onClick={() => blaettern(1)} className="neuheiten-knopf hidden sm:inline-flex" aria-label="Weiter">
            →
          </button>
          <button
            type="button"
            onClick={() => setAngehalten((a) => !a)}
            className="neuheiten-knopf"
            aria-pressed={angehalten}
            aria-label={angehalten ? "Laufband fortsetzen" : "Laufband anhalten"}
          >
            {angehalten ? "▶" : "❚❚"}
          </button>
        </div>
      </div>
    </section>
  );
}
