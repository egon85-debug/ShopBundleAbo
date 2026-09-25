import type { ReactNode } from "react";

/**
 * Wiederkehrende Bausteine des Shop-Stils (hell, eine Schrift, ein Akzent).
 * Die Regeln dahinter stehen in .claude/skills/winterfeld-design/SKILL.md.
 */

const GROESSEN = {
  // Große Überschriften sind dünn (300) und ziehen die Laufweite an.
  display: "text-heading-lg lg:text-display",
  gross: "text-heading lg:text-heading-lg",
  mittel: "text-heading-sm lg:text-heading",
} as const;

/**
 * Überschrift mit der orangen Akzentlinie darunter – dem Satzzeichen des Stils.
 * Die Linie ist gut ein Drittel der Überschriftbreite lang, nie ganz.
 */
export function Ueberschrift({
  children,
  als: Tag = "h2",
  groesse = "gross",
  mitte = false,
  hell = false,
  linie = true,
  augenbraue,
  className = "",
}: {
  children: ReactNode;
  als?: "h1" | "h2" | "h3";
  groesse?: keyof typeof GROESSEN;
  mitte?: boolean;
  /** Auf dunklem Band: weiße Schrift. */
  hell?: boolean;
  linie?: boolean;
  augenbraue?: string;
  className?: string;
}) {
  return (
    <div className={`${mitte ? "text-center" : ""} ${className}`}>
      {augenbraue && <p className="augenbraue mb-4">{augenbraue}</p>}
      <Tag
        className={`${GROESSEN[groesse]} font-light text-balance ${hell ? "text-white" : "text-tinte"}`}
      >
        {children}
      </Tag>
      {linie && (
        <span
          aria-hidden
          className={`akzentlinie mt-5 ${mitte ? "mx-auto w-[60px]" : ""} ${
            groesse === "mittel" ? "w-[80px]" : ""
          }`}
        />
      )}
    </div>
  );
}

/**
 * Produktbild auf ruhiger Fläche. Die Shopbilder aus dem Lager sind
 * freigestellt auf Weiß — deshalb "contain" mit etwas Luft statt Beschnitt.
 */
export function ProduktBild({
  url,
  alt,
  className = "",
  klein = false,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
  klein?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-bild bg-leinen ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className={`h-full w-full object-contain ${klein ? "p-1" : "p-4"} mix-blend-multiply`}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className={`${klein ? "text-[10px]" : "text-caption"} text-asche`}>Kein Bild</span>
        </div>
      )}
    </div>
  );
}

/** Verfügbarkeit in Worten – ohne Ampelfarben, der Punkt trägt die Aussage. */
export function Verfuegbarkeit({
  verfuegbar,
  nachbestellbar,
  ausfuehrlich = false,
}: {
  verfuegbar: number;
  nachbestellbar: boolean;
  ausfuehrlich?: boolean;
}) {
  const vorhanden = verfuegbar > 0;
  const text = vorhanden
    ? ausfuehrlich
      ? `${verfuegbar} sofort verfügbar`
      : `${verfuegbar} auf Lager`
    : nachbestellbar
      ? "Nachbestellbar"
      : ausfuehrlich
        ? "Derzeit nicht verfügbar"
        : "Nicht verfügbar";
  return (
    <span className={`inline-flex items-center gap-2 text-body-sm ${vorhanden ? "text-kohle" : "text-schiefer"}`}>
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${vorhanden || nachbestellbar ? "bg-tinte" : "border border-asche"}`}
      />
      {text}
    </span>
  );
}
