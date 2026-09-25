import type { Config } from "tailwindcss";

/**
 * Zwei Gestaltungswelten in einer Konfiguration:
 *
 * Shop (Kunden): hell, eine Schrift (Inter 300/400/500), ein einziger
 * Farbakzent (Orange). Werte aus der gewählten Stilvorlage, siehe
 * .claude/skills/winterfeld-design/SKILL.md. Farbnamen deutsch, damit sie
 * sich nicht mit dem Adminbereich mischen.
 *
 * Adminbereich: "Carbon", Signalblau, Bernstein; Archivo, Public Sans,
 * JetBrains Mono (carbon-*, signal-*, beacon-*, mist-*, font-display/mono).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Shop ──────────────────────────────────────────────────────────
        akzent: "#ff6105", // einzige Farbe: Hauptaktion, Akzentlinie, aktiver Schritt
        glut: "#ffa069", // nur Deko, nie Hauptaktion
        pfirsich: "#ffdfcd", // hervorgehobene Karte, höchstens eine je Abschnitt
        tinte: "#0a0a0a", // Haupttext
        kohle: "#292b2a", // Zweittext, Navigation
        schiefer: "#7a7b7b", // leise Angaben
        asche: "#a2a3a2", // Platzhalter, inaktiv
        haarlinie: "#e5e5e5", // Linien, Rahmen
        nebel: "#dfe0df", // weicher Rahmen auf Leinen
        knochen: "#e5e7eb", // Fläche für Geisterknöpfe
        leinen: "#f3f4f3", // zweite Fläche
        anthrazit: "#202120", // dunkles Band
        rauch: "#3c3e3d", // Linie im dunklen Band
        // ── Adminbereich ──────────────────────────────────────────────────
        carbon: {
          950: "#070B11",
          900: "#0A1018",
          800: "#111926",
          700: "#1A2534",
          600: "#273448",
        },
        signal: {
          50: "#EEF4FF",
          100: "#D9E6FF",
          300: "#7FA8FF",
          500: "#2D6FFF",
          600: "#1B57DC",
          700: "#1444B0",
        },
        beacon: {
          400: "#FFC14D",
          500: "#FFB020",
          600: "#D98B0C",
        },
        mist: {
          50: "#F7F9FB",
          100: "#EFF3F7",
          200: "#E1E8EF",
          300: "#CBD6E1",
          500: "#7A8A9B",
          700: "#42536A",
        },
      },
      fontFamily: {
        inter: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Archivo", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "Public Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Shop: Stufen der Stilvorlage. Die Laufweite zieht mit der Größe an.
        caption: ["12px", { lineHeight: "1.5", letterSpacing: "0" }],
        "body-sm": ["14px", { lineHeight: "1.5", letterSpacing: "0" }],
        body: ["16px", { lineHeight: "1.56", letterSpacing: "-0.01em" }],
        subheading: ["18px", { lineHeight: "1.5", letterSpacing: "-0.01em" }],
        "heading-sm": ["24px", { lineHeight: "1.33", letterSpacing: "-0.02em" }],
        heading: ["32px", { lineHeight: "1.22", letterSpacing: "-0.02em" }],
        "heading-lg": ["48px", { lineHeight: "1.2", letterSpacing: "-0.03em" }],
        display: ["72px", { lineHeight: "1.1", letterSpacing: "-0.036em" }],
        // Adminbereich
        "display-xl": ["clamp(2.75rem, 7vw, 5.5rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(2rem, 4.5vw, 3.5rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "display-md": ["clamp(1.5rem, 3vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
      },
      borderRadius: {
        // Shop: die Radien-Leiter 5 / 8 / 24 / 32 / 40 / 50
        karte: "5px",
        bild: "8px",
        klein: "8px",
        sekundaer: "24px",
        gross: "32px",
        nav: "40px",
        pille: "50px",
      },
      maxWidth: { seite: "1200px" },
      boxShadow: {
        // Shop: der einzige Schatten, nur für die Hauptaktion
        aktion: "rgba(255, 97, 5, 0.6) 1px 6px 14px 0px, rgba(0, 0, 0, 0.06) 0px 1px 4px 0px",
        card: "0 1px 2px rgba(10,16,24,.04), 0 8px 28px -12px rgba(10,16,24,.16)",
        lift: "0 2px 4px rgba(10,16,24,.06), 0 24px 48px -20px rgba(10,16,24,.28)",
        glow: "0 0 0 1px rgba(45,111,255,.28), 0 18px 48px -22px rgba(45,111,255,.65)",
      },
      backgroundImage: {
        "grid-fine":
          "linear-gradient(to right, rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.045) 1px, transparent 1px)",
      },
      backgroundSize: { "grid-fine": "48px 48px" },
      transitionTimingFunction: {
        precise: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scan-line": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(0.22,1,0.36,1) both",
        "scan-line": "scan-line 2.6s cubic-bezier(0.4,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
