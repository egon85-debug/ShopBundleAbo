"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";

import { Container, DeliveryTruck, DustField, FloatingParcel } from "./primitives";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Interaktive Hero-Szene: ein Logistikzentrum in Untersicht.
 * Die Kamera folgt der Maus sanft (Parallax) – nie sprunghaft, nie ablenkend.
 */
function SceneContent({ detailed }: { detailed: boolean }) {
  const rig = useRef<Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!rig.current) return;
    // Dämpfung: die Szene "atmet" der Maus hinterher statt ihr zu folgen.
    const targetX = pointer.y * 0.09;
    const targetY = pointer.x * 0.22;
    rig.current.rotation.x += (targetX - rig.current.rotation.x) * Math.min(delta * 2.4, 1);
    rig.current.rotation.y += (targetY - rig.current.rotation.y) * Math.min(delta * 2.4, 1);
  });

  return (
    <group ref={rig}>
      <DeliveryTruck detailed={detailed} position={[0.4, -1.15, 0]} rotation={[0, -0.42, 0]} scale={1.05} />
      <Container position={[-2.9, -0.75, -3.2]} rotation={[0, 0.28, 0]} scale={0.85} ribs={detailed ? 8 : 4} />
      {detailed && <Container position={[3.4, -0.75, -4.4]} rotation={[0, -0.5, 0]} scale={0.7} ribs={5} />}

      <FloatingParcel position={[2.5, 0.85, 0.4]} size={0.72} speed={0.3} />
      <FloatingParcel position={[-2.35, 1.25, -0.6]} size={0.5} speed={0.42} amplitude={0.16} />
      {detailed && <FloatingParcel position={[1.15, 1.85, -1.6]} size={0.38} speed={0.5} amplitude={0.2} />}

      {/* Ladefläche/Boden – fängt die Schatten auf. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.46, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0D1420" roughness={1} metalness={0} />
      </mesh>

      {detailed && <DustField count={70} />}
    </group>
  );
}

export default function HeroScene() {
  const profile = useRenderProfile();
  if (profile === "off") return null;

  const detailed = profile === "full";

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={detailed ? [1, 1.8] : [1, 1.25]}
      shadows={detailed}
      gl={{ antialias: detailed, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 0.9, 7.2], fov: 42 }}
      // Nur rendern, wenn sichtbar – spart Akku auf Mobilgeräten.
      frameloop="always"
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[5, 7, 4]}
          intensity={detailed ? 2.1 : 1.6}
          castShadow={detailed}
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-6, 2, -4]} intensity={18} color="#2D6FFF" distance={22} />
        <pointLight position={[6, 1, 3]} intensity={10} color="#FFB020" distance={18} />
        <fog attach="fog" args={["#070B11", 9, 22]} />
        <SceneContent detailed={detailed} />
      </Suspense>
    </Canvas>
  );
}
