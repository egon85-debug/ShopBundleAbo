"use client";

import { useEffect, useState } from "react";

/**
 * Bestimmt, wie aufwendig 3D gerendert werden darf.
 *
 *  - "off"      → keine 3D-Szene (reduzierte Bewegung oder kein WebGL)
 *  - "light"    → vereinfachte Geometrie, weniger Objekte, kein Schatten (Mobil/schwach)
 *  - "full"     → volle Szene
 *
 * Die Entscheidung fällt einmalig beim Mount; das Ergebnis steuert Geometrie,
 * Pixel-Ratio und Schatten, damit die Bedienbarkeit nie leidet.
 */
export type RenderProfile = "off" | "light" | "full";

export function useRenderProfile(): RenderProfile {
  // Serverseitig und beim ersten Paint bewusst "off": die Szene wird erst
  // nachgeladen, wenn feststeht, dass das Gerät sie tragen kann.
  const [profile, setProfile] = useState<RenderProfile>("off");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setProfile("off");
      return;
    }

    if (!hasWebGL()) {
      setProfile("off");
      return;
    }

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const smallScreen = window.innerWidth < 768;
    const fewCores = (navigator.hardwareConcurrency ?? 4) <= 4;
    const lowMemory = (navigator as NavigatorWithMemory).deviceMemory !== undefined &&
      (navigator as NavigatorWithMemory).deviceMemory! <= 4;
    const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;

    if (saveData) {
      setProfile("off");
      return;
    }

    setProfile(coarsePointer || smallScreen || fewCores || lowMemory ? "light" : "full");
  }, []);

  return profile;
}

type NavigatorWithMemory = Navigator & { deviceMemory?: number };
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

/** Zeigt an, ob der Nutzer reduzierte Bewegung wünscht (auch außerhalb von 3D nützlich). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}
