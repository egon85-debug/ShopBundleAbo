/**
 * Der Flug in den Warenkorb.
 *
 * Bewusst ohne React-Zustand: die Animation ist eine reine Darstellung, sie
 * gehoert nicht in den Komponentenbaum. Ein kurzlebiges Element, die
 * Web-Animations-API, fertig – so laesst sie sich von ueberall ausloesen, ohne
 * dass ein Anbieter drumherum noetig waere.
 */

/** Wird ausgeloest, wenn sich der Warenkorbinhalt geaendert hat. */
export const WARENKORB_EREIGNIS = "winterfeld:warenkorb-geaendert";

export function meldeWarenkorbAenderung(): void {
  window.dispatchEvent(new CustomEvent(WARENKORB_EREIGNIS));
}

function reduzierteBewegung(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Laesst ein Abbild des Produkts zum Warenkorb fliegen.
 *
 * @param quelle   Element, von dem aus geflogen wird (Produktbild oder Knopf).
 * @param bildUrl  Optionales Produktbild; ohne das fliegt ein schlichtes Feld.
 */
export function fliegeInDenWarenkorb(quelle: Element | null, bildUrl?: string | null): void {
  if (typeof window === "undefined") return;
  const ziel = document.querySelector("[data-warenkorb]");

  // Ohne Start, ohne Ziel oder bei reduzierter Bewegung: nur die Meldung.
  if (!quelle || !ziel || reduzierteBewegung()) {
    meldeWarenkorbAenderung();
    return;
  }

  const von = quelle.getBoundingClientRect();
  const nach = ziel.getBoundingClientRect();

  const flieger = document.createElement("div");
  flieger.setAttribute("aria-hidden", "true");
  Object.assign(flieger.style, {
    position: "fixed",
    left: `${von.left + von.width / 2 - 26}px`,
    top: `${von.top + von.height / 2 - 26}px`,
    width: "52px",
    height: "52px",
    borderRadius: "10px",
    zIndex: "60",
    pointerEvents: "none",
    boxShadow: "0 12px 32px -12px rgba(10,16,24,.55)",
    background: bildUrl ? `center/cover no-repeat url("${bildUrl}")` : "#2D6FFF",
    border: "1px solid rgba(255,255,255,.5)",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(flieger);

  const dx = nach.left + nach.width / 2 - (von.left + von.width / 2);
  const dy = nach.top + nach.height / 2 - (von.top + von.height / 2);

  // Ein Bogen statt einer Geraden: das Paket wird angehoben und faellt in den
  // Warenkorb. Der Scheitel liegt ueber der direkten Verbindung.
  const flug = flieger.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - Math.max(70, Math.abs(dx) * 0.22)}px) scale(.72)`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0, offset: 1 },
    ],
    { duration: 700, easing: "cubic-bezier(.4,0,.25,1)", fill: "forwards" },
  );

  flug.onfinish = () => {
    flieger.remove();
    // Erst jetzt melden: der Zaehler springt genau dann, wenn das Paket ankommt.
    meldeWarenkorbAenderung();
    ziel.dispatchEvent(new CustomEvent("winterfeld:warenkorb-treffer"));
  };
  flug.oncancel = () => {
    flieger.remove();
    meldeWarenkorbAenderung();
  };
}
