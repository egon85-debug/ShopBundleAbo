"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef, useState, type RefObject } from "react";
import type { Group } from "three";

import { useScrollProgress } from "@/components/motion/useScrollProgress";

import { Carton, STANDARD_MASSE, type Kartonregler } from "./Carton";
import { Luftpolsterfolie, Packband, Packpapier, Transportbox, Versandetiketten } from "./ProductShapes";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Der Karton aus dem Einstieg wird beim Weiterscrollen geoeffnet.
 *
 * Die Kamera folgt ihm, statt ihn verschwinden zu lassen: erst dreht er sich,
 * dann faehrt die Kamera heran, dann oeffnen sich die Klappen und die Produkte
 * schweben auseinander. Am Ende geht die Szene in den Kategorienbereich ueber
 * – die 3D-Ebene fuehrt also in den Shop hinein, statt neben ihm zu stehen.
 *
 * Die ganze Bewegung haengt am Scrollfortschritt, nicht an einer Zeitachse:
 * so bleibt der Besucher Herr ueber das Tempo.
 */

const INHALT = [
  { name: "Luftpolsterfolie", ziel: [-2.15, 0.95, 0.7] },
  { name: "Packband", ziel: [2.05, 1.15, 0.55] },
  { name: "Versandetiketten", ziel: [-1.75, -0.85, 1.05] },
  { name: "Transportbox", ziel: [2.25, -0.7, 0.2] },
  { name: "Packpapier", ziel: [0.15, 1.75, -0.55] },
] as const;

/** Ordnet einem Abschnitt des Fortschritts einen Wert von 0 bis 1 zu. */
function stufe(wert: number, von: number, bis: number): number {
  return Math.min(1, Math.max(0, (wert - von) / (bis - von)));
}

function Szene({
  fortschritt,
  detailliert,
}: {
  fortschritt: RefObject<number>;
  detailliert: boolean;
}) {
  const buehne = useRef<Group>(null);
  const inhalt = useRef<Group>(null);
  const regler = useRef<Kartonregler>({ aufbau: 1, deckel: 0 });
  const { camera } = useThree();

  useFrame((zustand, delta) => {
    const p = fortschritt.current ?? 0;

    // 1. Drehen (0 – 35 %), 2. Klappen oeffnen (30 – 60 %),
    // 3. Inhalt schwebt auseinander (55 – 100 %).
    regler.current.deckel = stufe(p, 0.3, 0.6);
    const auseinander = stufe(p, 0.55, 1);

    if (buehne.current) {
      buehne.current.rotation.y = p * Math.PI * 0.85;
      // Der Karton neigt sich, damit man in ihn hineinsieht.
      const zielKippen = -stufe(p, 0.25, 0.65) * 0.42;
      buehne.current.rotation.x += (zielKippen - buehne.current.rotation.x) * Math.min(delta * 3, 1);
    }

    // Die Kamera faehrt heran und hebt sich leicht – eine Fahrt, kein Schnitt.
    const naehe = stufe(p, 0.05, 0.7);
    const zielZ = 8.4 - naehe * 3.5;
    const zielY = 0.6 + naehe * 1.5;
    camera.position.z += (zielZ - camera.position.z) * Math.min(delta * 2.4, 1);
    camera.position.y += (zielY - camera.position.y) * Math.min(delta * 2.4, 1);
    camera.lookAt(0, 0, 0);

    // Die Produkte steigen aus dem Karton und ordnen sich im Halbkreis.
    if (inhalt.current) {
      inhalt.current.children.forEach((kind, index) => {
        const ziel = INHALT[index]?.ziel;
        if (!ziel) return;
        // Leicht versetzt, damit sie nicht wie ein Block herausfahren.
        const eigen = Math.min(1, Math.max(0, auseinander * 1.35 - index * 0.07));
        const weich = 1 - Math.pow(1 - eigen, 3);
        kind.position.set(ziel[0] * weich, ziel[1] * weich, ziel[2] * weich);
        kind.rotation.y = zustand.clock.elapsedTime * 0.3 + index;
        kind.rotation.x = Math.sin(zustand.clock.elapsedTime * 0.4 + index) * 0.2 * weich;
        kind.visible = eigen > 0.01;
      });
    }
  });

  return (
    <group ref={buehne}>
      <Carton regler={regler} masse={STANDARD_MASSE} groesse={2.9} klebeband={false} />

      <group ref={inhalt}>
        <Luftpolsterfolie />
        <Packband />
        <Versandetiketten />
        <Transportbox breite={0.7} />
        <Packpapier />
      </group>

      {detailliert && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.1, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#0B1119" roughness={1} />
        </mesh>
      )}
    </group>
  );
}

export default function CartonReveal() {
  const profil = useRenderProfile();
  const [schritt, setSchritt] = useState(0);
  const { ref, fortschritt } = useScrollProgress<HTMLDivElement>({
    stationen: 3,
    beiStation: setSchritt,
  });

  const detailliert = profil === "full";

  const texte = [
    { titel: "Ein Karton", text: "Der Faltkarton 300 × 200 × 150 mm – zweiwellig, FEFCO 0201." },
    { titel: "Wird geöffnet", text: "Vier Klappen, ein Handgriff, kein Werkzeug." },
    { titel: "Und ist voll Sortiment", text: "Polstern, kleben, etikettieren, lagern – alles aus einer Hand." },
  ];

  return (
    <div ref={ref} className="relative h-[300vh]" aria-hidden={profil !== "off" ? undefined : true}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden bg-carbon-950">
        <div className="pointer-events-none absolute inset-0 bg-grid-fine bg-grid-fine opacity-30" />

        {profil !== "off" && (
          <Canvas
            className="!absolute inset-0"
            dpr={detailliert ? [1, 1.75] : [1, 1.2]}
            shadows={detailliert}
            gl={{ antialias: detailliert, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 0.6, 8.4], fov: 42 }}
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow={detailliert} />
              <pointLight position={[-6, 2, 3]} intensity={16} color="#2D6FFF" distance={22} />
              <pointLight position={[5, 1, 4]} intensity={9} color="#FFB020" distance={18} />
              <fog attach="fog" args={["#070B11", 9, 24]} />
              <Szene fortschritt={fortschritt} detailliert={detailliert} />
            </Suspense>
          </Canvas>
        )}

        {/* Die Beschriftung traegt den Abschnitt auch ohne 3D. */}
        <div className="section pointer-events-none relative z-10">
          <p className="eyebrow text-signal-300">Was drin ist</p>
          <div className="mt-4 max-w-md">
            <h2 className="font-display text-display-lg font-extrabold text-white">
              {texte[schritt].titel}
            </h2>
            <p className="mt-4 text-lg text-mist-300">{texte[schritt].text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
