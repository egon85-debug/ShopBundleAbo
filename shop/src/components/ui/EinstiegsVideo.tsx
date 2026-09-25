"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kurzes, stummes Video für den Einstieg der Startseite.
 *
 * Es läuft einmal durch und bleibt auf dem letzten Bild stehen – eine Schleife
 * würde bei einer Handlung mit Anfang und Ende (Zuschnitt → verklebter Karton)
 * jedes Mal hart zurückspringen. Gestartet wird erst, wenn das Video zur
 * Hälfte sichtbar ist: Am Handy liegt es unter dem Text und wäre sonst schon
 * vorbei, bevor jemand hinscrollt.
 *
 * Gerendert wird zuerst das Endbild: Es ist sofort da, zählt als großes Bild
 * für die Ladezeit und bleibt für alle stehen, die auf ihrem Gerät reduzierte
 * Bewegung eingestellt haben. Erst danach tauscht der Browser es gegen das
 * Video, das mit seinem ersten Bild als Vorschau beginnt.
 */
export function EinstiegsVideo({
  video,
  anfangsbild,
  endbild,
  className = "",
}: {
  /** Pfad ohne Endung; erwartet werden `.webm` und `.mp4`. */
  video: string;
  anfangsbild: string;
  endbild: string;
  className?: string;
}) {
  const [abspielen, setAbspielen] = useState(false);
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pruefen = () => setAbspielen(!ruhig.matches);
    pruefen();
    ruhig.addEventListener("change", pruefen);
    return () => ruhig.removeEventListener("change", pruefen);
  }, []);

  useEffect(() => {
    const video = element.current;
    if (!abspielen || !video) return;
    const beobachter = new IntersectionObserver(
      ([eintrag]) => {
        if (!eintrag.isIntersecting) return;
        beobachter.disconnect();
        // Blockiert der Browser das Abspielen, bleibt die Vorschau stehen.
        video.play().catch(() => {});
      },
      { threshold: 0.5 },
    );
    beobachter.observe(video);
    return () => beobachter.disconnect();
  }, [abspielen]);

  const flaeche = `h-full w-full object-cover ${className}`;

  // Rein dekorativ: der Inhalt steht im Text daneben.
  // WebM (VP9) zuerst, MP4 (H.264) für Safari und ältere Geräte.
  return abspielen ? (
    <video
      ref={element}
      className={flaeche}
      poster={anfangsbild}
      muted
      playsInline
      preload="auto"
      aria-hidden
    >
      <source src={`${video}.webm`} type="video/webm" />
      <source src={`${video}.mp4`} type="video/mp4" />
    </video>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={flaeche} src={endbild} alt="" fetchPriority="high" />
  );
}
