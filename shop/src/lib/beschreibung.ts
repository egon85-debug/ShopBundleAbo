import sanitizeHtml from "sanitize-html";

/**
 * Produktbeschreibungen aus der Lagererfassung kommen als einfaches HTML
 * (<p>, <ul>, <li>, <strong>), selbst angelegte meist als Klartext mit
 * Zeilenumbrüchen. HTML wird hier auf eine kleine Auswahl harmloser Tags
 * ohne Attribute reduziert – Skripte, Links, Stile und Ereignis-Attribute
 * fallen weg, damit eine Beschreibung nie Code in die Seite bringt.
 */
const ERLAUBT = ["p", "ul", "ol", "li", "strong", "em", "b", "i", "br", "h3", "h4"];

/** Bereinigtes HTML oder `null`, wenn der Text gar kein HTML enthält (Klartext). */
export function beschreibungHtml(text: string | null | undefined): string | null {
  if (!text || !/<\/?[a-z][^>]*>/i.test(text)) return null;
  return sanitizeHtml(text, {
    allowedTags: ERLAUBT,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}
