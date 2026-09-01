"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";

import { wellpappeTexturen } from "./materials";

/**
 * Bausteine der Logistikszene – bewusst aus einfachen Grundkörpern gebaut:
 * kein externes Modell, keine Ladezeit, klare Silhouetten.
 */

const CARTON = "#C89B63";
const CARTON_DARK = "#A87F4C";
const TAPE = "#EFE3D0";
const TRUCK_BODY = "#F3F6FA";
const TRUCK_CAB = "#2D6FFF";
const CONTAINER = "#1B2534";

/** Versandkarton mit Klebeband – das Leitmotiv der Szene. */
export function Parcel({
  size = 1,
  ...props
}: { size?: number } & React.ComponentProps<"group">) {
  const { farbe, rauheit } = useMemo(() => wellpappeTexturen(), []);
  return (
    <group {...props}>
      <RoundedBox
        args={[size, size * 0.78, size * 0.86]}
        radius={size * 0.012}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={farbe} roughnessMap={rauheit} roughness={1} />
      </RoundedBox>
      {/* Klebeband längs */}
      <mesh position={[0, size * 0.391, 0]}>
        <boxGeometry args={[size * 0.16, size * 0.008, size * 0.87]} />
        <meshStandardMaterial color={TAPE} roughness={0.6} />
      </mesh>
      {/* Dunklere Schnittkante unten – so sieht angeschnittene Pappe aus. */}
      <mesh position={[0, -size * 0.39, 0]}>
        <boxGeometry args={[size * 1.001, size * 0.02, size * 0.861]} />
        <meshStandardMaterial color={CARTON_DARK} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Stilisierter Lieferwagen: Kabine, Kofferaufbau, Räder. */
export function DeliveryTruck({
  detailed = true,
  ...props
}: { detailed?: boolean } & React.ComponentProps<"group">) {
  const wheels = useRef<Group>(null);

  useFrame((_, delta) => {
    if (wheels.current) wheels.current.rotation.x -= delta * 2.2;
  });

  return (
    <group {...props}>
      {/* Kofferaufbau – lackiertes Blech: glatt, mit gerichteten Reflexen. */}
      <RoundedBox args={[2.5, 1.25, 1.35]} radius={0.05} smoothness={3} castShadow position={[-0.35, 0.62, 0]}>
        <meshStandardMaterial color={TRUCK_BODY} roughness={0.18} metalness={0.35} />
      </RoundedBox>
      {/* Fahrerhaus */}
      <RoundedBox args={[0.92, 1.0, 1.3]} radius={0.08} smoothness={3} castShadow position={[1.24, 0.5, 0]}>
        <meshStandardMaterial color={TRUCK_CAB} roughness={0.16} metalness={0.4} />
      </RoundedBox>
      {/* Windschutzscheibe */}
      {/* Windschutzscheibe – Glas: sehr glatt, stark spiegelnd. */}
      <mesh position={[1.71, 0.66, 0]}>
        <boxGeometry args={[0.04, 0.44, 1.12]} />
        <meshStandardMaterial color="#111926" roughness={0.04} metalness={0.9} />
      </mesh>
      {detailed && (
        <mesh position={[-0.35, 0.62, 0.681]}>
          <planeGeometry args={[1.5, 0.5]} />
          <meshStandardMaterial color="#2D6FFF" roughness={0.5} />
        </mesh>
      )}
      <group ref={wheels}>
        {[
          [-1.1, 0, 0.68],
          [-1.1, 0, -0.68],
          [1.15, 0, 0.68],
          [1.15, 0, -0.68],
        ].map(([x, y, z], index) => (
          <mesh key={index} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.18, detailed ? 20 : 10]} />
            <meshStandardMaterial color="#161C25" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Seecontainer mit Sicken – gibt der Szene industrielle Tiefe. */
export function Container({
  ribs = 8,
  ...props
}: { ribs?: number } & React.ComponentProps<"group">) {
  return (
    <group {...props}>
      {/* Seecontainer – lackierter Stahl: matt, aber deutlich metallisch. */}
      <RoundedBox args={[3.2, 1.4, 1.4]} radius={0.03} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color={CONTAINER} roughness={0.5} metalness={0.62} />
      </RoundedBox>
      {Array.from({ length: ribs }).map((_, index) => (
        <mesh key={index} position={[-1.5 + (index * 3) / (ribs - 1), 0, 0.705]}>
          <boxGeometry args={[0.05, 1.32, 0.02]} />
          <meshStandardMaterial color="#0D141F" roughness={0.45} metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** Langsam rotierendes Paket – Blickfang ohne Aufdringlichkeit. */
export function FloatingParcel({
  speed = 0.35,
  amplitude = 0.12,
  size = 1,
  ...props
}: { speed?: number; amplitude?: number; size?: number } & React.ComponentProps<"group">) {
  const ref = useRef<Group>(null);
  const baseY = (props.position as [number, number, number] | undefined)?.[1] ?? 0;

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * speed;
    ref.current.rotation.x = Math.sin(t * speed * 0.7) * 0.12;
    ref.current.position.y = baseY + Math.sin(t * speed * 1.6) * amplitude;
  });

  return (
    <group ref={ref} {...props}>
      <Parcel size={size} />
    </group>
  );
}

/** Dezente Lichtpartikel statt Konfetti – bleibt seriös. */
export function DustField({ count = 60 }: { count?: number }) {
  const ref = useRef<Mesh>(null);
  const positions = useRef(
    Float32Array.from(
      Array.from({ length: count * 3 }, () => (Math.random() - 0.5) * 16),
    ),
  );

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.current, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#7FA8FF" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}
