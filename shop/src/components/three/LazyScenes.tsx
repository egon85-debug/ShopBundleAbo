"use client";

import dynamic from "next/dynamic";

/**
 * Client-Wrapper für die 3D-Szenen.
 *
 * Der Code wird erst im Browser nachgeladen (`ssr: false`) – die Seite ist damit
 * vollständig lesbar und bedienbar, bevor eine einzige Zeile Three.js übertragen
 * wurde. Fällt WebGL aus oder wünscht die Nutzerin reduzierte Bewegung, rendert
 * die Szene selbst nichts (siehe useRenderProfile).
 */
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });
const PackageJourneyScene = dynamic(() => import("./PackageJourney"), {
  ssr: false,
  // Platzhalter hält die Höhe des Scroll-Abschnitts, bis die Szene geladen ist.
  loading: () => <div className="h-[420vh] bg-carbon-950" aria-hidden />,
});

export function LazyHeroScene() {
  return <HeroScene />;
}

export function LazyPackageJourney() {
  return <PackageJourneyScene />;
}
