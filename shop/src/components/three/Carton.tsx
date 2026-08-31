"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import type { Group, Mesh } from "three";

/**
 * Der Winterfeld-Faltkarton – ein Bauteil fuer drei Zwecke.
 *
 * Statt drei Modelle zu bauen (Hero, Exploded View, Kategoriebild), gibt es
 * eine Geometrie mit zwei Reglern:
 *
 *   `aufbau`  0 = die sechs Flaechen liegen auseinander, 1 = fertiger Karton
 *   `deckel`  0 = geschlossen, 1 = Klappen stehen offen
 *
 * Der zusammensetzende Karton im Hero ist damit derselbe Koerper wie die
 * auseinandergezogene Darstellung auf der Produktseite – nur andersherum
 * gefahren. Kein externes Modell, keine Ladezeit, jede Kante unter Kontrolle.
 *
 * Die Regler kommen als Referenz herein und werden in `useFrame` direkt auf die
 * Objekte geschrieben. React rendert dabei kein einziges Mal neu – eine Szene
 * ueber den Komponentenbaum zu animieren waere um Groessenordnungen teurer.
 */

const WELLPAPPE = "#C89B63";
const WELLPAPPE_INNEN = "#B98A52";
const WELLPAPPE_KANTE = "#8E6A3C";
const KLEBEBAND = "#EFE3D0";

/** Wandstaerke in Szeneneinheiten – zweiwellige Pappe, sichtbar aber duenn. */
const WAND = 0.022;

export type Kartonmasse = { laenge: number; breite: number; hoehe: number };

/** Faltkarton 300 x 200 x 150 mm – der Bestseller aus dem Sortiment. */
export const STANDARD_MASSE: Kartonmasse = { laenge: 300, breite: 200, hoehe: 150 };

export type Kartonregler = { aufbau: number; deckel: number };

/** Rechnet Millimeter so um, dass das laengste Mass `groesse` Einheiten ergibt. */
export function masseInEinheiten(masse: Kartonmasse, groesse: number) {
  const groesstes = Math.max(masse.laenge, masse.breite, masse.hoehe);
  const faktor = groesse / groesstes;
  return {
    b: masse.laenge * faktor,
    h: masse.hoehe * faktor,
    t: masse.breite * faktor,
  };
}

export function Carton({
  regler,
  masse = STANDARD_MASSE,
  groesse = 2,
  klebeband = true,
  ...props
}: {
  regler: MutableRefObject<Kartonregler>;
  masse?: Kartonmasse;
  groesse?: number;
  klebeband?: boolean;
} & React.ComponentProps<"group">) {
  const { b, h, t } = useMemo(() => masseInEinheiten(masse, groesse), [masse, groesse]);
  const spreizung = groesse * 0.55;

  const boden = useRef<Mesh>(null);
  const vorne = useRef<Mesh>(null);
  const hinten = useRef<Mesh>(null);
  const links = useRef<Mesh>(null);
  const rechts = useRef<Mesh>(null);
  const deckelHalter = useRef<Group>(null);
  const klappeVorn = useRef<Group>(null);
  const klappeHinten = useRef<Group>(null);
  const klappeRechts = useRef<Group>(null);
  const klappeLinks = useRef<Group>(null);
  const band = useRef<Mesh>(null);

  useFrame(() => {
    const { aufbau, deckel } = regler.current;
    // Wie weit die Flaechen auseinanderliegen, und wie stark sie dabei kippen.
    const weg = (1 - aufbau) * spreizung;
    const kippen = (1 - aufbau) * 0.5;
    const klappe = deckel * (Math.PI / 2) * 0.92;

    if (boden.current) {
      boden.current.position.y = -h / 2 - weg;
      boden.current.rotation.x = kippen * 0.3;
    }
    if (vorne.current) {
      vorne.current.position.z = t / 2 + weg;
      vorne.current.rotation.x = -kippen * 0.4;
    }
    if (hinten.current) {
      hinten.current.position.z = -t / 2 - weg;
      hinten.current.rotation.x = kippen * 0.4;
    }
    if (links.current) {
      links.current.position.x = -b / 2 - weg;
      links.current.rotation.z = kippen * 0.4;
    }
    if (rechts.current) {
      rechts.current.position.x = b / 2 + weg;
      rechts.current.rotation.z = -kippen * 0.4;
    }
    if (deckelHalter.current) deckelHalter.current.position.y = h / 2 + weg * 0.6;
    if (klappeVorn.current) klappeVorn.current.rotation.x = -klappe;
    if (klappeHinten.current) klappeHinten.current.rotation.x = klappe;
    if (klappeRechts.current) klappeRechts.current.rotation.z = klappe;
    if (klappeLinks.current) klappeLinks.current.rotation.z = -klappe;
    // Klebeband gehoert nur auf den fertigen, geschlossenen Karton.
    if (band.current) band.current.visible = aufbau > 0.97 && deckel < 0.05;
  });

  return (
    <group {...props}>
      <mesh ref={boden} castShadow receiveShadow>
        <boxGeometry args={[b, WAND, t]} />
        <meshStandardMaterial color={WELLPAPPE_INNEN} roughness={0.92} />
      </mesh>

      <mesh ref={vorne} castShadow receiveShadow>
        <boxGeometry args={[b, h, WAND]} />
        <meshStandardMaterial color={WELLPAPPE} roughness={0.88} />
      </mesh>

      <mesh ref={hinten} castShadow receiveShadow>
        <boxGeometry args={[b, h, WAND]} />
        <meshStandardMaterial color={WELLPAPPE_INNEN} roughness={0.9} />
      </mesh>

      <mesh ref={links} castShadow receiveShadow>
        <boxGeometry args={[WAND, h, t]} />
        <meshStandardMaterial color={WELLPAPPE_KANTE} roughness={0.9} />
      </mesh>

      <mesh ref={rechts} castShadow receiveShadow>
        <boxGeometry args={[WAND, h, t]} />
        <meshStandardMaterial color={WELLPAPPE_KANTE} roughness={0.9} />
      </mesh>

      {/* Vier Deckelklappen, jeweils an der Oberkante ihrer Wand angeschlagen. */}
      <group ref={deckelHalter}>
        <group ref={klappeVorn} position={[0, 0, t / 2]}>
          <mesh position={[0, 0, -t / 4]} castShadow>
            <boxGeometry args={[b, WAND, t / 2]} />
            <meshStandardMaterial color={WELLPAPPE} roughness={0.88} />
          </mesh>
        </group>
        <group ref={klappeHinten} position={[0, 0, -t / 2]}>
          <mesh position={[0, 0, t / 4]} castShadow>
            <boxGeometry args={[b, WAND, t / 2]} />
            <meshStandardMaterial color={WELLPAPPE} roughness={0.88} />
          </mesh>
        </group>
        <group ref={klappeRechts} position={[b / 2, 0, 0]}>
          <mesh position={[-b / 4, 0, 0]} castShadow>
            <boxGeometry args={[b / 2, WAND, t * 0.98]} />
            <meshStandardMaterial color={WELLPAPPE_INNEN} roughness={0.9} />
          </mesh>
        </group>
        <group ref={klappeLinks} position={[-b / 2, 0, 0]}>
          <mesh position={[b / 4, 0, 0]} castShadow>
            <boxGeometry args={[b / 2, WAND, t * 0.98]} />
            <meshStandardMaterial color={WELLPAPPE_INNEN} roughness={0.9} />
          </mesh>
        </group>

        {klebeband && (
          <mesh ref={band} position={[0, WAND * 0.8, 0]}>
            <boxGeometry args={[b * 0.17, WAND * 0.4, t * 1.005]} />
            <meshStandardMaterial color={KLEBEBAND} roughness={0.55} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/**
 * Karton, der sich beim Erscheinen aus seinen Flaechen zusammensetzt und
 * danach ruhig schwebt. Er neigt sich dem Zeiger entgegen – gedaempft, nie
 * sprunghaft.
 */
export function AufbauKarton({
  dauer = 1.6,
  verzoegerung = 0.2,
  masse,
  groesse,
  ...props
}: {
  dauer?: number;
  verzoegerung?: number;
  masse?: Kartonmasse;
  groesse?: number;
} & React.ComponentProps<"group">) {
  const huelle = useRef<Group>(null);
  const regler = useRef<Kartonregler>({ aufbau: 0, deckel: 0 });
  const zeit = useRef(0);

  useFrame((zustand, delta) => {
    zeit.current += delta;
    const fortschritt = Math.min(1, Math.max(0, (zeit.current - verzoegerung) / dauer));
    // Weiches Auslaufen, damit die letzte Flaeche nicht anschlaegt.
    regler.current.aufbau = 1 - Math.pow(1 - fortschritt, 3);

    if (!huelle.current) return;
    const t = zustand.clock.elapsedTime;
    const { pointer } = zustand;
    huelle.current.position.y = Math.sin(t * 0.6) * 0.07;
    huelle.current.rotation.y = t * 0.11 + pointer.x * 0.32;
    const zielX = -pointer.y * 0.18;
    huelle.current.rotation.x += (zielX - huelle.current.rotation.x) * Math.min(delta * 2.6, 1);
  });

  return (
    <group ref={huelle} {...props}>
      <Carton regler={regler} masse={masse} groesse={groesse} />
    </group>
  );
}
