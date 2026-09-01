"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useInView } from "@/components/motion/useInView";

import { formFuerKategorie } from "./kategorie-form";
import { useRenderProfile } from "./useRenderProfile";

/**
 * Raeumliche Ebene hinter einer Kategoriekachel.
 *
 * Sie liegt hinter dem Text, faengt keine Klicks ab und ist fuer
 * Vorlesesoftware unsichtbar – die Kachel bleibt eine gewoehnliche
 * Verknuepfung, die sofort funktioniert.
 *
 * Geladen wird sie erst, wenn drei Bedingungen zusammenkommen: das Geraet
 * traegt die volle Darstellung, die Kachel ist im Bild, und der Zeiger war
 * mindestens einmal darauf. Wer nur vorbeiscrollt, laedt also kein Three.js.
 */
const KategorieSzene = dynamic(() => import("./KategorieSzene"), { ssr: false });

export function KategorieHintergrund({ name }: { name: string }) {
  const profil = useRenderProfile();
  const { ref, sichtbar } = useInView<HTMLDivElement>("0px 0px -5% 0px");
  const [geladen, setGeladen] = useState(false);
  const aktiv = useRef(false);

  // Ueberall dort, wo 3D ueberhaupt laeuft. Vorher war "full" verlangt – damit
  // blieb die Ebene auf jedem Geraet mit wenigen Kernen oder ohne
  // Hardwarebeschleunigung unsichtbar, also auch dort, wo sie problemlos
  // liefe. Geladen wird sie ohnehin erst beim ersten Darueberfahren.
  const moeglich = profil !== "off" && sichtbar;

  useEffect(() => {
    if (!moeglich) return;
    const element = ref.current;
    if (!element) return;
    // Die Kachel selbst ist der Auslöser, nicht dieses Element: es liegt
    // hinter dem Text und bekommt keine Zeigerereignisse.
    const kachel = element.closest("[data-kategorie-kachel]");
    if (!kachel) return;

    const an = () => {
      aktiv.current = true;
      setGeladen(true);
    };
    const aus = () => {
      aktiv.current = false;
    };

    kachel.addEventListener("pointerenter", an);
    kachel.addEventListener("pointerleave", aus);
    kachel.addEventListener("focusin", an);
    kachel.addEventListener("focusout", aus);
    return () => {
      kachel.removeEventListener("pointerenter", an);
      kachel.removeEventListener("pointerleave", aus);
      kachel.removeEventListener("focusin", an);
      kachel.removeEventListener("focusout", aus);
    };
  }, [moeglich, ref]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-precise [.gruppe:hover_&]:opacity-100 [.gruppe:focus-within_&]:opacity-100"
    >
      {moeglich && geladen && <KategorieSzene form={formFuerKategorie(name)} aktiv={aktiv} />}
    </div>
  );
}
