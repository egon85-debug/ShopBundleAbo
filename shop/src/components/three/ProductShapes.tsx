"use client";

import { useMemo } from "react";

import { etikettTextur } from "./materials";

/**
 * Die Produkte aus dem Winterfeld-Sortiment als einfache Koerper.
 *
 * Wie beim Karton bewusst prozedural statt als geladenes Modell: klare
 * Silhouetten, keine Ladezeit, und die Farben kommen aus derselben Palette wie
 * der Rest der Seite. Erkennbar soll die Form sein, nicht fotorealistisch.
 */

const PAPPE = "#C89B63";
const FOLIE = "#9FC4E8";
const KUNSTSTOFF = "#2D6FFF";
const KUNSTSTOFF_DUNKEL = "#1B57DC";
const PAPIER = "#F4F7FA";
const KERN = "#8E6A3C";

/**
 * Packbandrolle: ein echter Ring mit sichtbarem Loch, darin der Pappkern.
 *
 * Vorher waren es zwei ineinandergesteckte Zylinder – ohne Loch sah das aus
 * wie eine Scheibe. Das Loch ist es, was eine Rolle als Rolle lesbar macht.
 */
export function Packband({ radius = 0.34, ...props }: { radius?: number } & React.ComponentProps<"group">) {
  const breite = 0.2;
  return (
    <group {...props}>
      {/* Bandwicklung – leicht glaenzend, damit sie nach Klebeband aussieht. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, breite, 40, 1, true]} />
        <meshStandardMaterial color="#E8C88A" roughness={0.32} metalness={0.05} side={2} />
      </mesh>
      {/* Stirnflaechen als Ringe – dadurch entsteht das Loch. */}
      {[breite / 2, -breite / 2].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[0, 0, 0]}>
          <ringGeometry args={[radius * 0.5, radius, 40]} />
          <meshStandardMaterial color="#D9B87A" roughness={0.45} side={2} />
        </mesh>
      ))}
      {/* Pappkern, innen sichtbar. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.5, radius * 0.5, breite * 0.98, 32, 1, true]} />
        <meshStandardMaterial color={KERN} roughness={0.95} side={2} />
      </mesh>
    </group>
  );
}

/** Luftpolsterfolie als aufgerollte Bahn – halbdurchsichtig, leicht blaeulich. */
export function Luftpolsterfolie({
  laenge = 0.9,
  ...props
}: { laenge?: number } & React.ComponentProps<"group">) {
  return (
    <group {...props}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, laenge, 22]} />
        <meshStandardMaterial color={FOLIE} roughness={0.12} metalness={0.02} transparent opacity={0.55} />
      </mesh>
      {/* Angedeutete Wickelkante, damit die Rolle als Rolle lesbar ist. */}
      <mesh position={[laenge / 2 + 0.005, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.262, 0.262, 0.012, 22]} />
        <meshStandardMaterial color="#7FA8FF" roughness={0.3} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Stapel Versandetiketten. Auf dem obersten Blatt liegt dasselbe Etikett wie
 * auf dem Karton – dadurch ist der Stapel sofort als Etiketten lesbar und
 * nicht als weisser Klotz.
 */
export function Versandetiketten({ ...props }: React.ComponentProps<"group">) {
  const etikett = useMemo(() => etikettTextur(), []);
  return (
    <group {...props}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.66, 0.08, 0.42]} />
        <meshStandardMaterial color={PAPIER} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.041, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.62, 0.39]} />
        <meshStandardMaterial map={etikett} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** Stapelbehaelter – blaue Transportbox mit Rand und Griffmulden. */
export function Transportbox({
  breite = 0.82,
  ...props
}: { breite?: number } & React.ComponentProps<"group">) {
  const hoehe = breite * 0.52;
  const tiefe = breite * 0.66;
  return (
    <group {...props}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[breite, hoehe, tiefe]} />
        <meshStandardMaterial color={KUNSTSTOFF} roughness={0.24} metalness={0.12} />
      </mesh>
      {/* Umlaufender Rand oben. */}
      <mesh position={[0, hoehe / 2, 0]}>
        <boxGeometry args={[breite * 1.04, hoehe * 0.1, tiefe * 1.04]} />
        <meshStandardMaterial color={KUNSTSTOFF_DUNKEL} roughness={0.22} metalness={0.14} />
      </mesh>
      {/* Griffmulden an den Stirnseiten. */}
      {[1, -1].map((seite) => (
        <mesh key={seite} position={[(breite / 2) * seite * 0.99, hoehe * 0.18, 0]}>
          <boxGeometry args={[0.02, hoehe * 0.16, tiefe * 0.42]} />
          <meshStandardMaterial color="#0F3E9E" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Bogen Packpapier, leicht gewellt – das fuenfte Element im Karton. */
export function Packpapier({ ...props }: React.ComponentProps<"group">) {
  return (
    <group {...props}>
      <mesh rotation={[-Math.PI / 2.6, 0.2, 0.1]} castShadow>
        <boxGeometry args={[0.66, 0.014, 0.5]} />
        <meshStandardMaterial color={PAPPE} roughness={0.95} />
      </mesh>
      <mesh position={[0.08, 0.1, -0.06]} rotation={[-Math.PI / 2.2, -0.3, 0.2]} castShadow>
        <boxGeometry args={[0.6, 0.014, 0.44]} />
        <meshStandardMaterial color="#D8B183" roughness={0.95} />
      </mesh>
    </group>
  );
}
