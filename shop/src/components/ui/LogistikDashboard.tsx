"use client";

import { useInView } from "@/components/motion/useInView";

/**
 * "Warum Winterfeld Logistik" als Logistik-Dashboard.
 *
 * Statt vier gleichrangiger Kacheln zeigt der Abschnitt jetzt einen Weg:
 * Bestellung → Zahlung → Versand → Tracking. Die Reihenfolge ist echt – eine
 * Bestellung durchlaeuft diese Stationen genau so –, deshalb duerfen sie
 * nummeriert und verbunden sein.
 *
 * Die Linie zeichnet sich beim Erscheinen einmal durch, das Paket wandert
 * darauf entlang. Danach ruht der Abschnitt: eine dauerhaft laufende Animation
 * neben Verkaufstexten waere Unruhe ohne Aussage.
 */
export function LogistikDashboard({
  punkte,
}: {
  punkte: { titel: string; text: string }[];
}) {
  const { ref, sichtbar } = useInView<HTMLDivElement>("0px 0px -18% 0px");

  return (
    <div ref={ref} className="relative mt-10">
      {/* Verbindungslinie durch alle vier Stationen – nur ab lg, wo sie
          nebeneinander stehen. */}
      <div className="pointer-events-none absolute inset-x-0 top-[42px] hidden lg:block" aria-hidden>
        <div className="relative mx-[12.5%] h-px bg-mist-200">
          <div
            className={`absolute inset-y-0 left-0 bg-signal-500 transition-[width] duration-[1400ms] ease-precise ${
              sichtbar ? "w-full" : "w-0"
            }`}
          />
          {/* Das Paket laeuft die Linie entlang und bleibt am Ende stehen. */}
          <div
            className={`absolute -top-[5px] h-2.5 w-2.5 rounded-[2px] bg-signal-500 shadow-[0_0_0_5px_rgba(45,111,255,.14)] transition-[left] duration-[1400ms] ease-precise ${
              sichtbar ? "left-[calc(100%-5px)]" : "left-[-5px]"
            }`}
          />
        </div>
      </div>

      <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {punkte.map((punkt, index) => (
          <li
            key={punkt.titel}
            className={`reveal reveal--aufsteigen ${sichtbar ? "ist-sichtbar" : ""} card relative p-6`}
            style={{ transitionDelay: `${index * 0.11}s` }}
          >
            {/* Stationspunkt sitzt auf der Linie. */}
            <span
              className={`absolute -top-[5px] left-6 hidden h-2.5 w-2.5 rounded-full border-2 border-white transition-colors duration-500 lg:block ${
                sichtbar ? "bg-signal-500" : "bg-mist-300"
              }`}
              style={{ transitionDelay: `${index * 0.32}s` }}
              aria-hidden
            />
            <span className="font-mono text-xs text-signal-600">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-2 font-display text-lg font-bold">{punkt.titel}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-mist-700">{punkt.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
