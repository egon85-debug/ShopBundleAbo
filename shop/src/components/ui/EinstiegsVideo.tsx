"use client";

import { useEffect, useState } from "react";

/**
 * Kurzes, stummes Schleifenvideo für den Einstieg der Startseite.
 *
 * Gerendert wird zuerst das Standbild – es ist sofort da, zählt als großes
 * Bild für die Ladezeit und bleibt für alle stehen, die auf ihrem Gerät
 * reduzierte Bewegung eingestellt haben. Erst danach tauscht der Browser das
 * Standbild gegen das Video.
 */
export function EinstiegsVideo({
  video,
  standbild,
  className = "",
}: {
  video: string;
  standbild: string;
  className?: string;
}) {
  const [abspielen, setAbspielen] = useState(false);

  useEffect(() => {
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pruefen = () => setAbspielen(!ruhig.matches);
    pruefen();
    ruhig.addEventListener("change", pruefen);
    return () => ruhig.removeEventListener("change", pruefen);
  }, []);

  const flaeche = `h-full w-full object-cover ${className}`;

  // Rein dekorativ: der Inhalt steht im Text daneben.
  return abspielen ? (
    <video
      className={flaeche}
      src={video}
      poster={standbild}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={flaeche} src={standbild} alt="" fetchPriority="high" />
  );
}
