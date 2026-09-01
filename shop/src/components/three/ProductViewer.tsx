"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef, useState } from "react";
import type { Group } from "three";

import { Carton, masseInEinheiten, type Kartonmasse, type Kartonregler } from "./Carton";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Interaktive Produktansicht.
 *
 * Drei Zustaende, die der Kunde selbst waehlt:
 *
 *   geschlossen  der Karton, wie er ankommt
 *   geoeffnet    die Klappen stehen offen, man sieht hinein
 *   zerlegt      die Flaechen liegen auseinander, die Masse stehen daran
 *
 * Bewusst mit Schaltflaechen statt scrollgesteuert: auf der Produktseite will
 * jemand lesen und kaufen. Das Scrollen dafuer zu vereinnahmen macht die Seite
 * schwerer bedienbar, nicht hochwertiger. Gezogen werden darf trotzdem – die
 * Ansicht laesst sich frei drehen.
 */

type Zustand = "geschlossen" | "geoeffnet" | "zerlegt";

const ZIELE: Record<Zustand, Kartonregler> = {
  geschlossen: { aufbau: 1, deckel: 0 },
  geoeffnet: { aufbau: 1, deckel: 1 },
  zerlegt: { aufbau: 0, deckel: 1 },
};

/** Faehrt die Regler weich auf den Zielzustand – ohne React je neu zu rendern. */
function AnimierterKarton({
  zustand,
  masse,
  detailliert,
}: {
  zustand: Zustand;
  masse: Kartonmasse;
  detailliert: boolean;
}) {
  const regler = useRef<Kartonregler>({ ...ZIELE.geschlossen });
  const huelle = useRef<Group>(null);

  useFrame((_, delta) => {
    const ziel = ZIELE[zustand];
    const schritt = Math.min(delta * 3.2, 1);
    regler.current.aufbau += (ziel.aufbau - regler.current.aufbau) * schritt;
    regler.current.deckel += (ziel.deckel - regler.current.deckel) * schritt;
    // Im zerlegten Zustand dreht sich nichts von selbst: die Masse sollen
    // lesbar bleiben.
    if (huelle.current && zustand !== "zerlegt") {
      huelle.current.rotation.y += delta * 0.16;
    }
  });

  return (
    <group ref={huelle}>
      <Carton regler={regler} masse={masse} groesse={2.4} />
      {zustand === "zerlegt" && <Massangaben masse={masse} detailliert={detailliert} />}
    </group>
  );
}

/**
 * Masslinien mit Beschriftung. Erscheinen nur im zerlegten Zustand – dort, wo
 * sie etwas erklaeren.
 */
function Massangaben({ masse, detailliert }: { masse: Kartonmasse; detailliert: boolean }) {
  const { b, h, t } = masseInEinheiten(masse, 2.4);
  const rand = 0.34;

  const eintraege: { punkt: [number, number, number]; text: string; achse: "x" | "y" | "z" }[] = [
    { punkt: [0, -h / 2 - rand, t / 2 + rand], text: `${masse.laenge} mm`, achse: "x" },
    { punkt: [b / 2 + rand, 0, t / 2 + rand], text: `${masse.hoehe} mm`, achse: "y" },
    { punkt: [b / 2 + rand, -h / 2 - rand, 0], text: `${masse.breite} mm`, achse: "z" },
  ];

  const laenge = { x: b, y: h, z: t };

  return (
    <group>
      {eintraege.map(({ punkt, text, achse }) => (
        <group key={achse} position={punkt}>
          {/* Masslinie als duenner Stab entlang der jeweiligen Achse. */}
          <mesh
            rotation={achse === "y" ? [0, 0, Math.PI / 2] : achse === "z" ? [0, Math.PI / 2, 0] : [0, 0, 0]}
          >
            <boxGeometry args={[laenge[achse], 0.012, 0.012]} />
            <meshBasicMaterial color="#2D6FFF" />
          </mesh>
          <Html center distanceFactor={detailliert ? 7 : 9} zIndexRange={[10, 0]}>
            <span className="whitespace-nowrap rounded bg-signal-500 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow">
              {text}
            </span>
          </Html>
        </group>
      ))}

      {/* Materialhinweis am Boden – erklaert, was man sieht. */}
      <Html position={[0, -h / 2 - rand * 2.4, 0]} center distanceFactor={detailliert ? 7 : 9}>
        <span className="whitespace-nowrap rounded bg-carbon-900/90 px-2.5 py-1 font-mono text-[11px] text-mist-200">
          Zweiwellige Wellpappe · FEFCO 0201
        </span>
      </Html>
    </group>
  );
}

export default function ProductViewer({
  masse,
  name,
}: {
  masse: Kartonmasse;
  name: string;
}) {
  const profil = useRenderProfile();
  const [zustand, setZustand] = useState<Zustand>("geschlossen");

  // Ohne 3D rendert der Aufrufer die Fotogalerie; hier nichts anzeigen.
  if (profil === "off") return null;
  const detailliert = profil === "full";

  const schalter: { wert: Zustand; text: string }[] = [
    { wert: "geschlossen", text: "Geschlossen" },
    { wert: "geoeffnet", text: "Geöffnet" },
    { wert: "zerlegt", text: "Zerlegt" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-mist-200 bg-gradient-to-b from-mist-50 to-mist-100">
      <div className="aspect-square w-full">
        <Canvas
          dpr={detailliert ? [1, 1.8] : [1, 1.25]}
          shadows={detailliert}
          gl={{ antialias: detailliert, alpha: true }}
          camera={{ position: [3.2, 2.1, 4.2], fov: 38 }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.75} />
            <directionalLight
              position={[4, 6, 4]}
              intensity={2.1}
              castShadow={detailliert}
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#7FA8FF" />
            <AnimierterKarton zustand={zustand} masse={masse} detailliert={detailliert} />
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              enableDamping
              dampingFactor={0.08}
              minPolarAngle={Math.PI * 0.16}
              maxPolarAngle={Math.PI * 0.62}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
        <div
          className="pointer-events-auto flex gap-1 rounded-xl border border-mist-200 bg-white/85 p-1 shadow-card backdrop-blur"
          role="group"
          aria-label={`Ansicht von ${name}`}
        >
          {schalter.map(({ wert, text }) => (
            <button
              key={wert}
              type="button"
              onClick={() => setZustand(wert)}
              aria-pressed={zustand === wert}
              className={`rounded-lg px-3.5 py-2 font-display text-[13px] font-bold transition-colors ${
                zustand === wert
                  ? "bg-carbon-900 text-white"
                  : "text-mist-700 hover:bg-mist-100 hover:text-carbon-900"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        <p className="font-mono text-[11px] text-mist-500">Zum Drehen ziehen</p>
      </div>
    </div>
  );
}
