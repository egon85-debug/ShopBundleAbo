"use client";

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
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

/**
 * Wohin die Produkte aus dem Karton steigen.
 *
 * Alle Ziele liegen rechts und oberhalb des Kartons – die linke Bildhaelfte
 * gehoert der Schrift. Vorher flogen sie in alle Richtungen, zwei davon aus
 * dem Bild heraus und eines mitten in die Ueberschrift.
 */
const INHALT = [
  { name: "Luftpolsterfolie", ziel: [-1.25, 1.35, 0.5] },
  { name: "Packband", ziel: [1.35, 1.15, 0.75] },
  { name: "Versandetiketten", ziel: [1.55, -0.35, 0.95] },
  { name: "Transportbox", ziel: [-0.15, 1.9, -0.2] },
  { name: "Packpapier", ziel: [1.9, 0.5, -0.35] },
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
    // Bewusst massvoll: vorher fuellte der Karton am Ende das halbe Bild als
    // braune Flaeche und lag ueber der Schrift.
    const naehe = stufe(p, 0.05, 0.7);
    const zielZ = 9.6 - naehe * 1.6;
    const zielY = 0.5 + naehe * 1.1;
    camera.position.z += (zielZ - camera.position.z) * Math.min(delta * 2.4, 1);
    camera.position.y += (zielY - camera.position.y) * Math.min(delta * 2.4, 1);
    camera.lookAt(0, 0.2, 0);

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
    // Die Buehne sitzt rechts der Bildmitte: links steht die Schrift.
    <group ref={buehne} position={[1.9, 0, 0]}>
      <Carton regler={regler} masse={STANDARD_MASSE} groesse={2.2} klebeband={false} />

      <group ref={inhalt}>
        <Luftpolsterfolie />
        <Packband />
        <Versandetiketten />
        <Transportbox breite={0.7} />
        <Packpapier />
      </group>

      {/* Der Karton steht auf etwas – ohne Kontaktschatten schwebte die ganze
          Szene im Nichts. */}
      <ContactShadows
        position={[0, -1.15, 0]}
        scale={8}
        opacity={0.5}
        blur={2.6}
        far={3}
        resolution={detailliert ? 512 : 256}
      />
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
              {/* Dieselbe Lichtsetzung wie im Einstieg: Fuehrung, kuehles
                  Gegenlicht fuer die Kanten, warme Aufhellung. */}
              <ambientLight intensity={0.4} />
              <directionalLight
                position={[4, 8, 5]}
                intensity={2.4}
                castShadow={detailliert}
                shadow-mapSize={[1024, 1024]}
              />
              <directionalLight position={[-6, 3, 2]} intensity={2.0} color="#9DBEFF" />
              <pointLight position={[5, 1, 4]} intensity={7} color="#FFB020" distance={16} />
              <Environment resolution={detailliert ? 256 : 128}>
                <Lightformer form="rect" intensity={2.4} position={[3, 4, 4]} scale={[8, 5, 1]} color="#FFF4E2" />
                <Lightformer form="rect" intensity={1.3} position={[-5, 1, -3]} scale={[7, 5, 1]} color="#7FA8FF" />
              </Environment>
              <fog attach="fog" args={["#070B11", 11, 28]} />
              <Szene fortschritt={fortschritt} detailliert={detailliert} />
            </Suspense>
          </Canvas>
        )}

        {/* Weiche Abdunklung nach links: selbst wenn ein Gegenstand einmal
            weit wandert, bleibt die Schrift darauf lesbar. */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-carbon-950 via-carbon-950/70 to-transparent lg:via-carbon-950/40"
          aria-hidden
        />

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
