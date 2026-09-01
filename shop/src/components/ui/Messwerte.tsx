/**
 * Technische Anmerkungen an den Raendern einer Szene.
 *
 * Aus der Referenzrichtung: kleine Monospace-Notizen in den Ecken, winzige
 * Statuspunkte, nie mittig, nie gross. Sie machen aus einer Szene eine
 * Instrumententafel – und im Fall eines Logistikers stehen dort echte Werte,
 * keine Zierschrift: Masse, Materialangabe, Bestand.
 *
 * Serverseitig gerendert, ohne JavaScript. Fuer Vorlesesoftware ausgeblendet:
 * dieselben Angaben stehen im Fliesstext und in den Produktdaten.
 */
export type Messwert = {
  text: string;
  /** Zeigt einen Statuspunkt: gruen = lieferbar, bernstein = knapp. */
  status?: "gut" | "knapp";
};

const ECKEN = {
  "oben-links": "left-6 top-24 sm:left-10",
  "oben-rechts": "right-6 top-24 items-end text-right sm:right-10",
  "unten-links": "bottom-10 left-6 sm:left-10",
  "unten-rechts": "bottom-10 right-6 items-end text-right sm:right-10",
} as const;

export function Messwerte({
  werte,
  ecke = "unten-rechts",
}: {
  werte: Messwert[];
  ecke?: keyof typeof ECKEN;
}) {
  if (werte.length === 0) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-10 hidden flex-col gap-1.5 md:flex ${ECKEN[ecke]}`}
    >
      {werte.map((wert) => (
        <span
          key={wert.text}
          className="flex items-center gap-2 font-mono text-[11px] leading-none tracking-[.04em] text-mist-500"
        >
          {wert.status && (
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                wert.status === "gut" ? "bg-emerald-400" : "bg-beacon-500"
              }`}
            />
          )}
          {wert.text}
        </span>
      ))}
    </div>
  );
}
