"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef, type RefObject } from "react";
import type { Group } from "three";

import { Carton, STANDARD_MASSE, type Kartonregler } from "./Carton";
import type { Kategorieform } from "./kategorie-form";
import { Luftpolsterfolie, Packband, Transportbox, Versandetiketten } from "./ProductShapes";

/**
 * Die raeumliche Ebene hinter einer Kategoriekachel.
 *
 * Sie erwacht beim Darueberfahren und legt sich wieder schlafen, sobald der
 * Zeiger weg ist. Die Kachel selbst bleibt eine gewoehnliche Verknuepfung –
 * 3D ist hier eine zusaetzliche Schicht, nie ein Ersatz fuer die Navigation.
 * Deshalb liegt die Szene auch hinter dem Text und faengt keine Klicks ab.
 *
 * Gerendert wird nur, solange sich etwas bewegt: eine ruhende Kachel kostet
 * keine Bilder pro Sekunde. Bei drei Kacheln nebeneinander ist das der
 * Unterschied zwischen einer ruhigen und einer heissen Grafikkarte.
 */

/** Verpackung: der Karton entfaltet sich und schliesst sich wieder. */
function KartonForm({ aktiv }: { aktiv: RefObject<boolean> }) {
  const regler = useRef<Kartonregler>({ aufbau: 1, deckel: 0 });
  const huelle = useRef<Group>(null);

  useFrame((zustand, delta) => {
    const ziel = aktiv.current ? 1 : 0;
    regler.current.deckel += (ziel - regler.current.deckel) * Math.min(delta * 3, 1);
    if (huelle.current) {
      huelle.current.rotation.y += delta * (aktiv.current ? 0.5 : 0.12);
      const zielKippen = aktiv.current ? -0.34 : -0.12;
      huelle.current.rotation.x += (zielKippen - huelle.current.rotation.x) * Math.min(delta * 2.4, 1);
      huelle.current.position.y = Math.sin(zustand.clock.elapsedTime * 0.7) * 0.05;
    }
  });

  return (
    <group ref={huelle}>
      <Carton regler={regler} masse={STANDARD_MASSE} groesse={1.9} klebeband={false} />
    </group>
  );
}

/** Lagertechnik: die Transportbox faehrt aus dem Regal heraus. */
function BoxForm({ aktiv }: { aktiv: RefObject<boolean> }) {
  const box = useRef<Group>(null);

  useFrame((zustand, delta) => {
    if (!box.current) return;
    // Herausfahren nach vorn statt Drehen: das ist die Bewegung eines Regals.
    const zielZ = aktiv.current ? 0.95 : -0.35;
    box.current.position.z += (zielZ - box.current.position.z) * Math.min(delta * 3.2, 1);
    box.current.rotation.y = -0.42 + Math.sin(zustand.clock.elapsedTime * 0.4) * 0.05;
    box.current.position.y = Math.sin(zustand.clock.elapsedTime * 0.6) * 0.04;
  });

  return (
    <group>
      {/* Zwei angedeutete Regalboeden geben der Bewegung ihren Sinn. */}
      {[0.62, -0.72].map((y) => (
        <mesh key={y} position={[0, y, -0.4]} receiveShadow>
          <boxGeometry args={[2.6, 0.06, 1.2]} />
          <meshStandardMaterial color="#1A2534" roughness={0.85} metalness={0.2} />
        </mesh>
      ))}
      <group ref={box} position={[0, -0.1, -0.35]}>
        <Transportbox breite={1.25} />
      </group>
    </group>
  );
}

/** Versandzubehoer: Packband, Etiketten und Folie als kleine Komposition. */
function ZubehoerForm({ aktiv }: { aktiv: RefObject<boolean> }) {
  const gruppe = useRef<Group>(null);

  useFrame((zustand, delta) => {
    if (!gruppe.current) return;
    const t = zustand.clock.elapsedTime;
    const ziel = aktiv.current ? 1 : 0;
    gruppe.current.children.forEach((kind, index) => {
      // Beim Darueberfahren ruecken die Stuecke auseinander.
      const weite = 0.45 + ziel * 0.55;
      const winkel = (index / 3) * Math.PI * 2 + t * 0.22;
      kind.position.x += (Math.cos(winkel) * weite - kind.position.x) * Math.min(delta * 2.6, 1);
      kind.position.y += (Math.sin(winkel) * weite * 0.55 - kind.position.y) * Math.min(delta * 2.6, 1);
      kind.rotation.y = t * 0.4 + index;
      kind.rotation.z = Math.sin(t * 0.5 + index) * 0.25;
    });
  });

  return (
    <group ref={gruppe} scale={1.35}>
      <Packband />
      <Versandetiketten />
      <Luftpolsterfolie laenge={0.75} />
    </group>
  );
}

export default function KategorieSzene({
  form,
  aktiv,
}: {
  form: Kategorieform;
  aktiv: RefObject<boolean>;
}) {
  return (
    <Canvas
      className="!absolute inset-0"
      // Absichtlich sparsam: es koennen mehrere Kacheln gleichzeitig im Bild
      // sein. Kein Schattenwurf, geringe Aufloesung, keine Kantenglaettung.
      dpr={[1, 1.3]}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 0.5, 4.6], fov: 40 }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={1.9} />
        <pointLight position={[-4, 1, 2]} intensity={9} color="#2D6FFF" distance={14} />
        {form === "karton" && <KartonForm aktiv={aktiv} />}
        {form === "box" && <BoxForm aktiv={aktiv} />}
        {form === "zubehoer" && <ZubehoerForm aktiv={aktiv} />}
      </Suspense>
    </Canvas>
  );
}
