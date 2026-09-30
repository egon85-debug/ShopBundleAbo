"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kurzes, stummes Video für den Einstieg der Startseite – mit Abspann.
 *
 * Das Video (Zuschnitt → verklebter Karton) läuft einmal und bleibt auf dem
 * letzten Bild stehen. Danach fahren vier Wörter über dem Karton ein, und ein
 * Versandetikett mit dem Logo wird auf die Vorderseite gelegt. Wörter und
 * Etikett sind kein Teil des Videos, sondern liegen als SVG darüber: So bleiben
 * Schrift und Logo scharf und exakt – KI-Videos verzerren beides.
 *
 * Gestartet wird erst, wenn das Video zur Hälfte sichtbar ist (am Handy liegt
 * es unter dem Text). Wer reduzierte Bewegung eingestellt hat, sieht sofort das
 * Endbild mit Wörtern und Etikett, ohne Bewegung.
 */

// Koordinaten beziehen sich auf das 720 × 720 große Videobild.
const WOERTER = [
  { wort: "Lagernd", x: 50.7 },
  { wort: "Verpackt", x: 197.3, punkt: 176.6 },
  { wort: "Versendet", x: 353.1, punkt: 332.4 },
  { wort: "Verfolgbar", x: 525.6, punkt: 505 },
];
const GRUNDLINIE = 166;
// Vorderseite des Kartons im Endbild; das Etikett (260 × 170) wird affin
// darauf abgebildet – Abweichung zur echten Perspektive unter 3 px.
const ETIKETT_MATRIX = "matrix(0.6226 0.1824 0.0140 0.6729 189.56 338.69)";
// Strichcode: feste Folge von Strichbreiten, rein dekorativ.
// Paare aus Strich- und Lückenbreite, zusammen 224 Einheiten breit.
const STRICHE = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 2, 1, 3, 1, 2, 1]
  .reduce<{ x: number; striche: { x: number; breite: number }[] }>(
    (stand, breite, i) => {
      if (i % 2 === 0) stand.striche.push({ x: stand.x, breite: breite * 3.2 });
      stand.x += breite * 3.2;
      return stand;
    },
    { x: 0, striche: [] },
  ).striche;

type Zustand = "warten" | "laeuft" | "fertig";

export function EinstiegsVideo({
  video,
  anfangsbild,
  endbild,
}: {
  /** Pfad ohne Endung; erwartet werden `.webm` und `.mp4`. */
  video: string;
  anfangsbild: string;
  endbild: string;
}) {
  const [bewegung, setBewegung] = useState(false);
  const [abspann, setAbspann] = useState<Zustand>("fertig");
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pruefen = () => {
      setBewegung(!ruhig.matches);
      setAbspann(ruhig.matches ? "fertig" : "warten");
    };
    pruefen();
    ruhig.addEventListener("change", pruefen);
    return () => ruhig.removeEventListener("change", pruefen);
  }, []);

  useEffect(() => {
    const video = element.current;
    if (!bewegung || !video) return;
    const beobachter = new IntersectionObserver(
      ([eintrag]) => {
        if (!eintrag.isIntersecting) return;
        beobachter.disconnect();
        // Blockiert der Browser das Abspielen, zeigen wir gleich das Endbild.
        video.play().catch(() => setAbspann("fertig"));
      },
      { threshold: 0.5 },
    );
    beobachter.observe(video);
    return () => beobachter.disconnect();
  }, [bewegung]);

  const flaeche = "absolute inset-0 h-full w-full object-cover";

  return (
    <div className="relative h-full w-full">
      {bewegung ? (
        <video
          ref={element}
          className={flaeche}
          poster={anfangsbild}
          muted
          playsInline
          preload="auto"
          onEnded={() => setAbspann("laeuft")}
          aria-hidden
        >
          {/* WebM (VP9) zuerst, MP4 (H.264) für Safari und ältere Geräte. */}
          <source src={`${video}.webm`} type="video/webm" />
          <source src={`${video}.mp4`} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={flaeche} src={endbild} alt="" fetchPriority="high" />
      )}

      <svg
        className="abspann absolute inset-0 h-full w-full"
        data-zustand={abspann}
        viewBox="0 0 720 720"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Lagernd, verpackt, versendet, verfolgbar – Winterfeldt Logistik"
      >
        <g fontSize="30" letterSpacing="-0.6" fill="#0a0a0a">
          {WOERTER.map(({ wort, x, punkt }, i) => (
            <g key={wort} className="abspann-wort" style={{ animationDelay: `${0.15 + i * 0.35}s` }}>
              {punkt !== undefined && (
                <text x={punkt} y={GRUNDLINIE} fill="#ff6105">
                  ·
                </text>
              )}
              <text x={x} y={GRUNDLINIE}>
                {wort}
              </text>
            </g>
          ))}
        </g>

        {/* Etikett: äußere Gruppe bewegt sich (CSS), innere liegt auf der Kartonfläche. */}
        <g className="abspann-etikett" style={{ animationDelay: "2.2s" }}>
          <g transform={ETIKETT_MATRIX}>
            <clipPath id="etikett-form">
              <rect width="260" height="170" rx="6" />
            </clipPath>
            <g clipPath="url(#etikett-form)">
              <rect width="260" height="170" fill="#fff" />
              <rect width="260" height="16" fill="#ff6105" />
            </g>
            <rect width="260" height="170" rx="6" fill="none" stroke="rgba(0,0,0,.12)" />
            <image href="/marke/winterfeld-logistik.svg" x="18" y="32.6" width="224" height="35.3" />
            <g fill="#0a0a0a">
              {STRICHE.map(({ x, breite }) => (
                <rect key={x} x={18 + x} y="90" width={breite} height="56" />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
