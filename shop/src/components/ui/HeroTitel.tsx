"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Magnetic } from "@/components/motion/MagneticButton";
import { useRenderProfile } from "@/components/three/useRenderProfile";

/**
 * Der Einstieg der Startseite.
 *
 * Die Schrift erscheint erst, wenn der Karton in der Szene dahinter fertig
 * zusammengesetzt ist – zuerst die Wortmarke, dann der Claim, dann der Rest.
 * Laeuft keine Szene (reduzierte Bewegung, kein WebGL, schwaches Geraet), gibt
 * es nichts abzuwarten: dann steht alles sofort da.
 */
/**
 * Eine Stufe des Einstiegs. Sichtbar wird sie ueber eine Klasse; wie die
 * Bewegung aussieht, steht in globals.css (.hero-stufe).
 */
function Stufe({
  kinder,
  verzoegerung,
  losgelaufen,
  className,
}: {
  kinder: ReactNode;
  verzoegerung: number;
  losgelaufen: boolean;
  className?: string;
}) {
  return (
    <div
      className={["hero-stufe", losgelaufen ? "ist-sichtbar" : "", className].filter(Boolean).join(" ")}
      style={{ transitionDelay: `${verzoegerung}s` }}
    >
      {kinder}
    </div>
  );
}

export function HeroTitel() {
  const profil = useRenderProfile();
  const [losgelaufen, setLosgelaufen] = useState(false);

  // Erst nach dem ersten Anstrich losfahren, damit der Uebergang auch
  // tatsaechlich sichtbar ist statt schon im ersten Bild fertig zu sein.
  useEffect(() => {
    const id = requestAnimationFrame(() => setLosgelaufen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Warten hat nur Sinn, wenn dahinter wirklich etwas zusammengesetzt wird.
  const szeneLaeuft = profil !== "off";
  const start = szeneLaeuft ? (profil === "full" ? 1.55 : 1.05) : 0;

  return (
    <div className="section relative z-10 flex min-h-[86vh] flex-col justify-center py-24">
      <Stufe losgelaufen={losgelaufen} verzoegerung={start}
        kinder={<p className="eyebrow text-signal-300">Winterfeld Logistik</p>} />

      <Stufe losgelaufen={losgelaufen} verzoegerung={start + 0.14} className="mt-5"
        kinder={
          <h1 className="max-w-3xl font-display text-display-xl font-extrabold text-balance">
            Logistik.
            <br />
            Einfach. <span className="text-signal-500">Digital.</span>
          </h1>
        } />

      <Stufe losgelaufen={losgelaufen} verzoegerung={start + 0.3} className="mt-6"
        kinder={
          <p className="max-w-xl text-lg leading-relaxed text-mist-300">
            Produkte bestellen, sicher bezahlen und zuverlässig mit DHL geliefert bekommen.
          </p>
        } />

      <Stufe losgelaufen={losgelaufen} verzoegerung={start + 0.42} className="mt-9"
        kinder={
          <div className="flex flex-wrap gap-3">
            <Magnetic staerke={0.24}>
              <Link href="/shop" className="btn-primary">
                Shop entdecken
              </Link>
            </Magnetic>
            <Magnetic staerke={0.24}>
              <Link
                href="#kategorien"
                className="btn border border-white/25 bg-white/5 text-white backdrop-blur transition-colors hover:border-white/60 hover:bg-white/10"
              >
                Kategorien ansehen
              </Link>
            </Magnetic>
          </div>
        } />

      <Stufe losgelaufen={losgelaufen} verzoegerung={start + 0.56} className="mt-16"
        kinder={
          <dl className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            {[
              ["Versand", "DHL & Express"],
              ["Zahlung", "Stripe-gesichert"],
              ["Lieferzeit", "ab 1 Werktag"],
              ["Tracking", "automatisch"],
            ].map(([label, wert]) => (
              <div key={label}>
                <dt className="font-mono text-[11px] uppercase tracking-[.16em] text-mist-500">{label}</dt>
                <dd className="mt-1 font-display text-[15px] font-bold text-white">{wert}</dd>
              </div>
            ))}
          </dl>
        } />
    </div>
  );
}
