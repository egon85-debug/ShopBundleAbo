"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

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
const KURVE = [0.22, 1, 0.36, 1] as const;

function Stufe({
  kinder,
  verzoegerung,
  reduziert,
  className,
}: {
  kinder: ReactNode;
  verzoegerung: number;
  reduziert: boolean;
  className?: string;
}) {
  if (reduziert) return <div className={className}>{kinder}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, delay: verzoegerung, ease: KURVE }}
    >
      {kinder}
    </motion.div>
  );
}

export function HeroTitel() {
  const reduzierteBewegung = useReducedMotion();
  const profil = useRenderProfile();

  // Warten hat nur Sinn, wenn dahinter wirklich etwas zusammengesetzt wird.
  const szeneLaeuft = profil !== "off";
  const reduziert = Boolean(reduzierteBewegung) || !szeneLaeuft;
  const start = szeneLaeuft ? (profil === "full" ? 1.55 : 1.05) : 0;

  return (
    <div className="section relative z-10 flex min-h-[86vh] flex-col justify-center py-24">
      <Stufe reduziert={reduziert} verzoegerung={start}
        kinder={<p className="eyebrow text-signal-300">Winterfeld Logistik</p>} />

      <Stufe reduziert={reduziert} verzoegerung={start + 0.14} className="mt-5"
        kinder={
          <h1 className="max-w-3xl font-display text-display-xl font-extrabold text-balance">
            Logistik.
            <br />
            Einfach. <span className="text-signal-500">Digital.</span>
          </h1>
        } />

      <Stufe reduziert={reduziert} verzoegerung={start + 0.3} className="mt-6"
        kinder={
          <p className="max-w-xl text-lg leading-relaxed text-mist-300">
            Produkte bestellen, sicher bezahlen und zuverlässig mit DHL geliefert bekommen.
          </p>
        } />

      <Stufe reduziert={reduziert} verzoegerung={start + 0.42} className="mt-9"
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

      <Stufe reduziert={reduziert} verzoegerung={start + 0.56} className="mt-16"
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
