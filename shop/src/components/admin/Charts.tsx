/**
 * Dashboard-Visualisierungen als reines SVG – keine Chart-Bibliothek, keine
 * Client-Runtime. Farbrollen: eine Akzentfarbe für Einzelserien (Magnitude),
 * getrennte Statusfarben mit Textlabel für Zustände (nie Farbe allein).
 */
import { formatCents } from "@/lib/money";

const ACCENT = "#2D6FFF";

/** Umsatzverlauf: eine Serie → keine Legende, der Titel benennt sie. */
export function RevenueChart({
  series,
}: {
  series: { day: string; revenueCents: number; orderCount: number }[];
}) {
  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...series.map((point) => point.revenueCents), 1);
  const stepX = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;

  const x = (index: number) => padding.left + index * stepX;
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const line = series.map((point, index) => `${x(index)},${y(point.revenueCents)}`).join(" ");
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${x(series.length - 1)},${padding.top + plotHeight}`;
  const lastIndex = series.length - 1;

  const formatDay = (day: string) =>
    new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(day));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">Umsatzverlauf der letzten {series.length} Tage in Euro</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Umsatzverlauf der letzten ${series.length} Tage. Höchstwert ${formatCents(max)}.`}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = max * ratio;
          const posY = y(value);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={posY} x2={width - padding.right} y2={posY} stroke="#E1E8EF" strokeWidth="1" />
              <text x={padding.left - 8} y={posY + 4} textAnchor="end" fontSize="11" fill="#7A8A9B" fontFamily="var(--font-mono)">
                {Math.round(value / 100)} €
              </text>
            </g>
          );
        })}

        <polygon points={area} fill="url(#revenue-fill)" />
        <polyline points={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {series.length > 0 && (
          <>
            <circle cx={x(lastIndex)} cy={y(series[lastIndex].revenueCents)} r="5" fill={ACCENT} stroke="#FFFFFF" strokeWidth="2" />
            <text
              x={Math.min(x(lastIndex), width - padding.right - 4)}
              y={Math.max(y(series[lastIndex].revenueCents) - 12, padding.top + 10)}
              textAnchor="end"
              fontSize="12"
              fontWeight="700"
              fill="#111926"
            >
              {formatCents(series[lastIndex].revenueCents)}
            </text>
          </>
        )}

        {[0, Math.floor(lastIndex / 2), lastIndex].map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === lastIndex ? "end" : "middle"}
            fontSize="11"
            fill="#7A8A9B"
            fontFamily="var(--font-mono)"
          >
            {series[index] ? formatDay(series[index].day) : ""}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/** Meistverkaufte Produkte: Balken mit direkter Beschriftung, eine Farbe. */
export function TopProductsChart({
  items,
}: {
  items: { name: string; sku: string; quantity: number; revenueCents: number }[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-mist-700">Noch keine bezahlten Bestellungen vorhanden.</p>;
  }
  const max = Math.max(...items.map((item) => item.quantity), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.sku}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate text-sm font-semibold">{item.name}</span>
            <span className="shrink-0 font-mono text-sm tabular text-mist-700">
              {item.quantity}× · {formatCents(item.revenueCents)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist-100">
            <div className="h-full rounded-full bg-signal-500" style={{ width: `${Math.max((item.quantity / max) * 100, 4)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Kennzahlenkachel: Zustand über Farbe UND Text – nie Farbe allein. */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent" | "good" | "warning" | "critical";
}) {
  const tones = {
    neutral: "border-l-mist-300",
    accent: "border-l-signal-500",
    good: "border-l-emerald-600",
    warning: "border-l-amber-600",
    critical: "border-l-rose-700",
  } as const;

  return (
    <div className={`card border-l-4 p-5 ${tones[tone]}`}>
      <p className="font-display text-xs font-bold uppercase tracking-[.1em] text-mist-700">{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold tabular">{value}</p>
      {hint && <p className="mt-1 text-sm text-mist-700">{hint}</p>}
    </div>
  );
}

/** Statusabzeichen: Farbe + Text, wie im Bestellworkflow. */
export function StatusBadge({ label, tone }: { label: string; tone: "ok" | "warn" | "danger" | "neutral" }) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    neutral: "bg-mist-100 text-mist-700",
  } as const;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-display text-xs font-bold ${tones[tone]}`}>
      {label}
    </span>
  );
}
