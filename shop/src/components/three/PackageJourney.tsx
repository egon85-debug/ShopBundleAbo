"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Group } from "three";

import { Container, DeliveryTruck, Parcel } from "./primitives";
import { useRenderProfile } from "./useRenderProfile";

/**
 * "Package Journey" (Punkt 18): Ein Paket begleitet den Besucher beim Scrollen
 * durch die Stationen Auswahl → Bestellung → Zahlung → Verpackung → Versand →
 * Zustellung. Die Bewegung ist an den Scrollfortschritt gekoppelt, nicht an eine
 * Zeitachse – dadurch wirkt sie kontrolliert statt verspielt.
 */
export const JOURNEY_STATIONS = [
  { title: "Produkt auswählen", text: "Kuratiertes Sortiment, klare Daten, ehrliche Verfügbarkeit." },
  { title: "Bestellung", text: "Schneller Checkout – auch ohne Kundenkonto." },
  { title: "Sichere Zahlung", text: "Stripe verarbeitet Karte, Apple Pay und Google Pay." },
  { title: "Verpackung", text: "Kommissionierung und geprüfte Versandvorbereitung." },
  { title: "DHL / DHL Express", text: "Versandetikett, Sendungsnummer, Tracking – automatisch." },
  { title: "Zustellung", text: "Ankunft beim Empfänger, Bestellung abgeschlossen." },
] as const;

function JourneyParcel({ progress, detailed }: { progress: React.RefObject<number>; detailed: boolean }) {
  const group = useRef<Group>(null);
  const truck = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!group.current) return;
    const p = progress.current ?? 0;

    // Weg des Pakets: von links nach rechts, mit Anheben in der Verpackungsphase.
    const targetX = -4.6 + p * 9.2;
    const targetY = Math.sin(p * Math.PI) * 0.85 - 0.2;
    const targetZ = Math.sin(p * Math.PI * 2) * 0.6;

    group.current.position.x += (targetX - group.current.position.x) * Math.min(delta * 3.4, 1);
    group.current.position.y += (targetY - group.current.position.y) * Math.min(delta * 3.4, 1);
    group.current.position.z += (targetZ - group.current.position.z) * Math.min(delta * 3.4, 1);
    group.current.rotation.y = p * Math.PI * 2.2;
    group.current.rotation.z = Math.sin(p * Math.PI * 3) * 0.14;

    // Der LKW fährt erst ab Station "Versand" ins Bild.
    if (truck.current) {
      const truckTarget = p > 0.62 ? 2.1 : 9.5;
      truck.current.position.x += (truckTarget - truck.current.position.x) * Math.min(delta * 2, 1);
    }
  });

  return (
    <>
      <group ref={group} position={[-4.6, -0.2, 0]}>
        <Parcel size={0.95} />
      </group>
      <group ref={truck} position={[9.5, -1.05, -1.4]} rotation={[0, -0.3, 0]} scale={0.8}>
        <DeliveryTruck detailed={detailed} />
      </group>
      {detailed && <Container position={[-5.6, -0.7, -3.6]} rotation={[0, 0.35, 0]} scale={0.6} ribs={5} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0B1119" roughness={1} />
      </mesh>
    </>
  );
}

export default function PackageJourney({ onStationChange }: { onStationChange?: (index: number) => void }) {
  const profile = useRenderProfile();
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [station, setStation] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const raw = total > 0 ? -rect.top / total : 0;
      const clamped = Math.min(Math.max(raw, 0), 1);
      progress.current = clamped;

      const index = Math.min(
        JOURNEY_STATIONS.length - 1,
        Math.floor(clamped * JOURNEY_STATIONS.length),
      );
      setStation((current) => {
        if (current !== index) onStationChange?.(index);
        return index;
      });
    };

    const onScroll = () => {
      // Scroll-Events auf einen Frame drosseln.
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onStationChange]);

  const detailed = profile === "full";

  return (
    <div ref={containerRef} className="relative h-[420vh]">
      <div data-dunkel className="sticky top-0 flex h-screen items-center overflow-hidden bg-carbon-950">
        <div className="pointer-events-none absolute inset-0 bg-grid-fine bg-grid-fine opacity-40" />

        {profile !== "off" && (
          <Canvas
            className="!absolute inset-0"
            dpr={detailed ? [1, 1.75] : [1, 1.2]}
            shadows={detailed}
            gl={{ antialias: detailed, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 1.2, 8], fov: 40 }}
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[4, 8, 5]} intensity={2} castShadow={detailed} />
              <pointLight position={[-6, 2, 2]} intensity={14} color="#2D6FFF" distance={20} />
              <fog attach="fog" args={["#070B11", 10, 24]} />
              <JourneyParcel progress={progress} detailed={detailed} />
            </Suspense>
          </Canvas>
        )}

        <div className="section relative z-10">
          <p className="eyebrow text-signal-300">Der Weg Ihrer Sendung</p>
          <div className="mt-4 max-w-xl">
            <h2 className="font-display text-display-lg font-extrabold text-white">
              {JOURNEY_STATIONS[station].title}
            </h2>
            <p className="mt-4 text-lg text-mist-300">{JOURNEY_STATIONS[station].text}</p>
          </div>

          {/* Stationsleiste – zeigt den Fortschritt auch ohne 3D. */}
          <ol className="mt-10 flex flex-wrap gap-2">
            {JOURNEY_STATIONS.map((item, index) => (
              <li
                key={item.title}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors duration-300 ${
                  index === station
                    ? "border-signal-500 bg-signal-500 text-white"
                    : index < station
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 text-mist-500"
                }`}
              >
                {String(index + 1).padStart(2, "0")} {item.title}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
