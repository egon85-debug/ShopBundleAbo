/*
 * Zum Bearbeiten im Admin: keine Tags im Eingabefeld, sondern Absätze
 * (getrennt durch eine Leerzeile) und Aufzählungen mit „• “. Beim Speichern
 * wird daraus wieder HTML. Gleiche Regeln wie backend/admin/beschreibung.js.
 */
const TAG = /<\/?[a-z][^>]*>/i;
const AUFZAEHLUNG = /^[•\-*–]\s+/;

export function istHtml(text: string | null | undefined): boolean {
  return TAG.test(text ?? "");
}

function zeichenLesen(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

function zeichenSchuetzen(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML → lesbarer Text fürs Eingabefeld. Klartext bleibt unverändert. */
export function htmlZuText(html: string | null | undefined): string {
  if (!html) return "";
  if (!istHtml(html)) return html;
  const text = html
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/?(p|div|ul|ol|h[1-6])(\s[^>]*)?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return zeichenLesen(text)
    .split("\n").map((z) => z.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text aus dem Eingabefeld → HTML (<p>, <ul>, <li>, <br>). */
export function textZuHtml(text: string): string {
  return text.replace(/\r/g, "").trim().split(/\n\s*\n/).map((block) => {
    const teile: string[] = [];
    let liste: string[] = [];
    let absatz: string[] = [];
    const absatzFertig = () => {
      if (absatz.length) teile.push(`<p>${absatz.map(zeichenSchuetzen).join("<br>")}</p>`);
      absatz = [];
    };
    const listeFertig = () => {
      if (liste.length) teile.push(`<ul>${liste.map((z) => `<li>${zeichenSchuetzen(z)}</li>`).join("")}</ul>`);
      liste = [];
    };
    for (const zeile of block.split("\n").map((z) => z.trim()).filter(Boolean)) {
      if (AUFZAEHLUNG.test(zeile)) { absatzFertig(); liste.push(zeile.replace(AUFZAEHLUNG, "")); }
      else { listeFertig(); absatz.push(zeile); }
    }
    absatzFertig();
    listeFertig();
    return teile.join("");
  }).join("");
}

/**
 * Gespeicherter Wert für das Eingabefeld „Beschreibung“: War die bisherige
 * Beschreibung HTML, wird der Text wieder zu HTML – unverändert bleibt sie
 * wörtlich erhalten. Klartext bleibt Klartext.
 */
export function beschreibungAusFeld(text: string | null, vorher: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  if (!vorher || !istHtml(vorher)) return text;
  if (htmlZuText(vorher) === text.trim()) return vorher;
  return textZuHtml(text);
}
