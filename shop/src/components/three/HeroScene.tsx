"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";

import { AufbauKarton } from "./Carton";
import { Container, DeliveryTruck, DustField, FloatingParcel } from "./primitives";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Die Heldenszene: im Zentrum setzt sich ein Winterfeld-Versandkarton aus
 * seinen Flaechen zusammen, waehrend im Hintergrund das Logistikzentrum steht.
 *
 * Der Karton ist der Hauptdarsteller – Fahrzeug und Container bleiben bewusst
 * weit hinten und dunkel. Wer die Seite oeffnet, soll zuerst das Paket sehen,
 * nicht eine volle Szene.
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
      <DeliveryTruck
        detailed={detailliert}
        position={[-1.9, -1.2, -3.4]}
        rotation={[0, -0.5, 0]}
        scale={0.82}
      />
      <Container position={[-4.6, -0.8, -6.2]} rotation={[0, 0.3, 0]} scale={0.8} ribs={detailliert ? 8 : 4} />
      {detailliert && (
        <Container position={[4.9, -0.85, -7.4]} rotation={[0, -0.52, 0]} scale={0.66} ribs={5} />
      )}

      <FloatingParcel position={[-3.1, 1.5, -2.2]} size={0.4} speed={0.4} amplitude={0.16} />
      {detailliert && <FloatingParcel position={[4.0, 1.9, -3.0]} size={0.32} speed={0.5} amplitude={0.2} />}

      {/* Boden faengt die Schatten auf und gibt dem Karton Gewicht. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0D1420" roughness={1} metalness={0} />
      </mesh>

      {detailliert && <DustField count={70} />}
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
        <ambientLight intensity={0.5} />
        {/* Hauptlicht von schraeg oben – erzeugt die Kanten am Karton. */}
        <directionalLight
          position={[4.5, 7, 5]}
          intensity={detailliert ? 2.4 : 1.8}
          castShadow={detailliert}
          shadow-mapSize={[1024, 1024]}
        />
        {/* Markenblau von hinten links, Bernstein von rechts: die beiden
            Signalfarben des Hauses als Lichtreflexe statt als Flaechen. */}
        <pointLight position={[-7, 2.5, -4]} intensity={22} color="#2D6FFF" distance={26} />
        <pointLight position={[6.5, 1.2, 3.5]} intensity={12} color="#FFB020" distance={20} />
        <fog attach="fog" args={["#070B11", 10, 26]} />
        <SzenenInhalt detailliert={detailliert} />
      </Suspense>
    </Canvas>
  );
}
