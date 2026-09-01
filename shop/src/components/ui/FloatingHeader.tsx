"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Huelle der Kopfzeile: reagiert auf die Scrollposition, kennt aber ihren
 * Inhalt nicht. So bleibt die Navigation selbst eine Server-Komponente und
 * die Kategorien werden weiterhin auf dem Server gerendert.
 *
 * Am Seitenanfang der Startseite liegt sie ueber der dunklen Heldenszene: dort
 * wird sie durchsichtig und ihre Beschriftung hell (siehe globals.css,
 * [data-ueber-helden]). Eine durchsichtige Kopfzeile mit dunkler Schrift waere
 * auf dunklem Grund unlesbar – deshalb gehoert beides zusammen.
 *
 * Sobald gescrollt wird, ruecken die Kanten zusammen, der Hintergrund wird
 * milchig und eine feine Linie trennt sie vom Inhalt.
 *
 * Bewusst kein Ein- und Ausblenden beim Scrollen nach oben und unten: eine
 * Navigation, die verschwindet, kostet beim Einkaufen mehr, als die Ruhe
 * bringt.
 */
export function FloatingHeader({ children }: { children: ReactNode }) {
  const [gescrollt, setGescrollt] = useState(false);
  // Liegt gerade ein dunkler Abschnitt unter der Kopfzeile?
  const [aufDunklem, setAufDunklem] = useState(false);
  const letzterWert = useRef(false);
  const letzterGrund = useRef(false);
  // Nur die Startseite beginnt mit einer dunklen Szene unter der Kopfzeile.
  const ueberHelden = usePathname() === "/";

  useEffect(() => {
    const pruefen = () => {
      const jetzt = window.scrollY > 24;
      if (jetzt !== letzterWert.current) {
        letzterWert.current = jetzt;
        setGescrollt(jetzt);
      }

      // Welcher Abschnitt liegt unmittelbar unter der Kopfzeile? Abschnitte mit
      // dunklem Grund tragen data-dunkel. Ohne diese Pruefung stand die helle
      // Kopfzeile als Fremdkoerper ueber den dunklen 3D-Abschnitten.
      // Deutlich unterhalb der Kopfzeile abtasten: direkt darunter liegt noch
      // sie selbst (sie ist klebend und liegt oben auf), und die Abfrage
      // liefert dann immer die Kopfzeile statt des Abschnitts dahinter.
      const darunter = document.elementFromPoint(window.innerWidth / 2, (jetzt ? 56 : 72) + 40);
      const dunklerGrund = Boolean(darunter?.closest("[data-dunkel]"));
      if (dunklerGrund !== letzterGrund.current) {
        letzterGrund.current = dunklerGrund;
        setAufDunklem(dunklerGrund);
      }
    };
    pruefen();
    window.addEventListener("scroll", pruefen, { passive: true });
    window.addEventListener("resize", pruefen, { passive: true });
    return () => {
      window.removeEventListener("scroll", pruefen);
      window.removeEventListener("resize", pruefen);
    };
  }, []);

  // Am Seitenanfang der Startseite durchsichtig, ueber dunklen Abschnitten
  // dunkel-milchig, sonst hell. In allen drei Faellen mit passender Schrift.
  const dunkel = (ueberHelden && !gescrollt) || aufDunklem;

  return (
    <header
      data-ueber-helden={dunkel ? "" : undefined}
      className={[
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 ease-precise",
        dunkel && gescrollt
          ? "border-b border-white/10 bg-carbon-950/70 backdrop-blur-xl"
          : dunkel
            ? "border-b border-transparent bg-transparent"
            : gescrollt
              ? "border-b border-mist-200 bg-white/80 shadow-[0_1px_0_rgba(10,16,24,.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/70"
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
