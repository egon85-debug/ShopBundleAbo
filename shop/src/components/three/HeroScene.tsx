"use client";

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";

import { AufbauKarton } from "./Carton";
import { DustField, FloatingParcel } from "./primitives";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Die Heldenszene: im Zentrum setzt sich ein Winterfeld-Versandkarton aus
 * seinen Flaechen zusammen, waehrend im Hintergrund das Logistikzentrum steht.
 *
 * Der Karton ist der einzige Hauptdarsteller. Die linke Bildhaelfte gehoert
 * der Schrift und bleibt frei von Geometrie – wer die Seite oeffnet, soll das
 * Paket sehen und den Satz lesen koennen, nicht beides uebereinander.
 */
function SzenenInhalt({ detailliert }: { detailliert: boolean }) {
  const kamerafahrt = useRef<Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!kamerafahrt.current) return;
    // Die Szene "atmet" der Maus hinterher statt ihr zu folgen. Der Karton
    // selbst neigt sich zusaetzlich (siehe AufbauKarton) – zusammen ergibt das
    // Tiefe, ohne dass etwas springt.
    const zielX = pointer.y * 0.06;
    const zielY = pointer.x * 0.14;
    kamerafahrt.current.rotation.x += (zielX - kamerafahrt.current.rotation.x) * Math.min(delta * 2.2, 1);
    kamerafahrt.current.rotation.y += (zielY - kamerafahrt.current.rotation.y) * Math.min(delta * 2.2, 1);
  });

  return (
    <group ref={kamerafahrt}>
      {/* Hauptdarsteller: rechts der Bildmitte, damit die Schrift links Platz hat. */}
      <AufbauKarton
        position={[2.15, 0.35, 0.6]}
        groesse={detailliert ? 2.35 : 2.0}
        dauer={detailliert ? 1.7 : 1.1}
      />

      {/* Umgebung – weit hinten, dunkel, nur als Kontext. */}
      {/* Ein Blickfang je Bildschirmhoehe: der Karton. Fahrzeug und Container
          standen hier frueher mit im Bild – angeschnitten am Rand und als
          dunkle Kloetze nicht erkennbar. Sie tragen nichts bei und sind raus.
          Was bleibt, ist ein einzelnes kleines Paket weit hinten, das der Szene
          Tiefe gibt, ohne um Aufmerksamkeit zu bitten. */}
      {detailliert && <FloatingParcel position={[4.9, 1.9, -5.5]} size={0.26} speed={0.4} amplitude={0.16} />}

      {/* Kontaktschatten statt Bodenplatte: der Karton steht, statt zu schweben.
          Das ist der Unterschied zwischen einem Gegenstand und einem Bild davon. */}
      <ContactShadows
        position={[2.15, -1.35, 0.6]}
        scale={7}
        opacity={0.55}
        blur={2.4}
        far={3.2}
        resolution={detailliert ? 512 : 256}
        color="#000000"
      />

      {detailliert && <DustField count={50} />}
    </group>
  );
}

export default function HeroScene() {
  const profil = useRenderProfile();
  if (profil === "off") return null;

  const detailliert = profil === "full";

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={detailliert ? [1, 1.8] : [1, 1.25]}
      shadows={detailliert}
      gl={{ antialias: detailliert, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 0.7, 7.6], fov: 40 }}
    >
      <Suspense fallback={null}>
        {/* Dreipunktlicht statt eines Scheinwerfers: Fuehrung von schraeg oben,
            kuehles Gegenlicht fuer die Kantenzeichnung, schwache Aufhellung. */}
        <ambientLight intensity={0.42} />
        <directionalLight
          position={[4.5, 7, 5]}
          intensity={detailliert ? 2.6 : 2.0}
          castShadow={detailliert}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
        />
        {/* Gegenlicht von links: zeichnet die Kante des Kartons und hellt die
            Schattenseite so weit auf, dass die Wellpappe dort lesbar bleibt. */}
        <directionalLight position={[-6, 3, 2]} intensity={2.2} color="#9DBEFF" />
        <pointLight position={[6.5, 1.2, 3.5]} intensity={9} color="#FFB020" distance={18} />

        {/* Umgebungsreflexion aus Leuchtflaechen – ohne sie wirkt jedes Material
            wie Pappe, auch der Kunststoff. Prozedural, also ohne Ladezeit. */}
        <Environment resolution={detailliert ? 256 : 128}>
          <Lightformer form="rect" intensity={2.6} position={[3, 4, 4]} scale={[8, 5, 1]} color="#FFF4E2" />
          <Lightformer form="rect" intensity={1.4} position={[-5, 1, -3]} scale={[7, 5, 1]} color="#7FA8FF" />
          <Lightformer form="circle" intensity={0.9} position={[0, -3, 2]} scale={5} color="#2D6FFF" />
        </Environment>

        <fog attach="fog" args={["#070B11", 11, 28]} />
        <SzenenInhalt detailliert={detailliert} />
      </Suspense>
    </Canvas>
  );
}
