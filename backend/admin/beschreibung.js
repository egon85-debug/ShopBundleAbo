/*
 * Beschreibungen sind für den Shop einfaches HTML (<p>, <ul>, <li>). In den
 * Eingabefeldern soll niemand Tags sehen: Dort stehen Absätze getrennt durch
 * eine Leerzeile und Aufzählungen mit „• “. Beim Speichern wird daraus wieder HTML.
 */
const BESCHREIBUNG_TAG = /<\/?[a-z][^>]*>/i;

function istHtml(text) {
  return BESCHREIBUNG_TAG.test(text || "");
}

function zeichenLesen(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

/** HTML → lesbarer Text zum Bearbeiten. Klartext bleibt unverändert. */
function htmlZuText(html) {
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

function zeichenSchuetzen(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const AUFZAEHLUNG = /^[•\-*–]\s+/;

/** Text aus dem Eingabefeld → HTML für den Shop. */
function textZuHtml(text) {
  const bloecke = (text || "").replace(/\r/g, "").trim().split(/\n\s*\n/);
  return bloecke.map((block) => {
    const zeilen = block.split("\n").map((z) => z.trim()).filter(Boolean);
    const teile = [];
    let liste = [];
    let absatz = [];
    const absatzFertig = () => {
      if (absatz.length) teile.push(`<p>${absatz.map(zeichenSchuetzen).join("<br>")}</p>`);
      absatz = [];
    };
    const listeFertig = () => {
      if (liste.length) teile.push(`<ul>${liste.map((z) => `<li>${zeichenSchuetzen(z)}</li>`).join("")}</ul>`);
      liste = [];
    };
    for (const zeile of zeilen) {
      if (AUFZAEHLUNG.test(zeile)) { absatzFertig(); liste.push(zeile.replace(AUFZAEHLUNG, "")); }
      else { listeFertig(); absatz.push(zeile); }
    }
    absatzFertig();
    listeFertig();
    return teile.join("");
  }).join("");
}

/** Wert aus dem Eingabefeld zum Speichern: HTML, wenn der alte Wert HTML war. */
function beschreibungSpeichern(text, vorher) {
  return istHtml(vorher) ? textZuHtml(text) : text;
}

if (typeof module !== "undefined") {
  module.exports = { istHtml, htmlZuText, textZuHtml, beschreibungSpeichern };
}
