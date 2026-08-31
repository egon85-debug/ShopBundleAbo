"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Huelle der Kopfzeile: reagiert auf die Scrollposition, kennt aber ihren
 * Inhalt nicht. So bleibt die Navigation selbst eine Server-Komponente und
 * die Kategorien werden weiterhin auf dem Server gerendert.
 *
 * Am Seitenanfang liegt die Kopfzeile ueber der Heldenszene und laesst sie
 * durchscheinen. Sobald gescrollt wird, ruecken die Kanten zusammen, der
 * Hintergrund wird milchig und eine feine Linie trennt sie vom Inhalt.
 *
 * Bewusst kein Ein- und Ausblenden beim Scrollen nach oben und unten: eine
 * Navigation, die verschwindet, kostet beim Einkaufen mehr, als die Ruhe
 * bringt.
 */
export function FloatingHeader({
  children,
  ueberHelden = false,
}: {
  children: ReactNode;
  /** Startet die Seite mit einer dunklen Szene direkt unter der Kopfzeile? */
  ueberHelden?: boolean;
}) {
  const [gescrollt, setGescrollt] = useState(false);
  const letzterWert = useRef(false);

  useEffect(() => {
    const pruefen = () => {
      const jetzt = window.scrollY > 24;
      if (jetzt !== letzterWert.current) {
        letzterWert.current = jetzt;
        setGescrollt(jetzt);
      }
    };
    pruefen();
    window.addEventListener("scroll", pruefen, { passive: true });
    return () => window.removeEventListener("scroll", pruefen);
  }, []);

  const dunkel = ueberHelden && !gescrollt;

  return (
    <header
      data-ueber-helden={dunkel ? "" : undefined}
      className={[
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 ease-precise",
        gescrollt
          ? "border-b border-mist-200 bg-white/80 shadow-[0_1px_0_rgba(10,16,24,.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/70"
          : dunkel
            ? "border-b border-transparent bg-transparent"
            : "border-b border-mist-200 bg-white/85 backdrop-blur-xl",
      ].join(" ")}
    >
      <div
        className={[
          "transition-[height,padding] duration-300 ease-precise",
          gescrollt ? "h-14 sm:h-16" : "h-16 sm:h-[72px]",
        ].join(" ")}
      >
        {children}
      </div>
    </header>
  );
}
