import { formatCents } from "@/lib/money";

/** Was für Grundpreis und Pfand von einem Artikel gebraucht wird. */
export type Inhaltsangaben = {
  netContentAmount: number | null;
  netContentUnit: string | null;
  unitsPerPack: number | null;
  depositCents?: number | null;
  depositType?: string | null;
};

/**
 * Grundpreis je 1 l bzw. 1 kg über alle Einheiten der Verkaufseinheit
 * (z. B. 11,94 € für 6 × 1 l → 1,99 €/l). Ohne Füllmenge: null.
 * Pfand gehört nicht in den Grundpreis.
 */
export function grundpreis(priceCents: number, p: Inhaltsangaben): { cents: number; je: "l" | "kg" } | null {
  if (!p.netContentAmount || (p.netContentUnit !== "ml" && p.netContentUnit !== "g")) return null;
  const gesamt = p.netContentAmount * (p.unitsPerPack || 1); // ml bzw. g
  if (gesamt <= 0) return null;
  return { cents: Math.round((priceCents * 1000) / gesamt), je: p.netContentUnit === "ml" ? "l" : "kg" };
}

export function grundpreisText(priceCents: number, p: Inhaltsangaben): string | null {
  const g = grundpreis(priceCents, p);
  return g ? `${formatCents(g.cents)}/${g.je}` : null;
}

/** „zzgl. 1,50 € Pfand (Einweg)“ – oder null ohne Pfand. */
export function pfandText(p: Inhaltsangaben): string | null {
  if (!p.depositCents || p.depositCents <= 0) return null;
  const art = p.depositType === "mehrweg" ? " (Mehrweg)" : p.depositType === "einweg" ? " (Einweg)" : "";
  return `zzgl. ${formatCents(p.depositCents)} Pfand${art}`;
}

/** „6 × 1 l“, „500 g“ – lesbare Füllmenge, oder null. */
export function fuellmengeText(p: Inhaltsangaben): string | null {
  if (!p.netContentAmount || !p.netContentUnit) return null;
  const gross = p.netContentAmount >= 1000;
  const zahl = (gross ? p.netContentAmount / 1000 : p.netContentAmount).toLocaleString("de-DE", {
    maximumFractionDigits: 3,
  });
  const einheit = p.netContentUnit === "ml" ? (gross ? "l" : "ml") : gross ? "kg" : "g";
  const anzahl = p.unitsPerPack && p.unitsPerPack > 1 ? `${p.unitsPerPack} × ` : "";
  return `${anzahl}${zahl} ${einheit}`;
}
