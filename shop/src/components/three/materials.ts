"use client";

import {
  CanvasTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

/**
 * Materialien, die im Browser entstehen.
 *
 * Kein geladenes Bild, keine Ladezeit, kein zusaetzlicher Netzverkehr – die
 * Strukturen werden auf ein Canvas gezeichnet und als Textur verwendet. Das
 * ist der Unterschied zwischen einem braunen Quader und einem Karton.
 */

let wellpappe: { farbe: Texture; rauheit: Texture } | null = null;

/**
 * Wellpappe: Papierfaser (feines Rauschen) ueber der Wellung (Streifen).
 *
 * Die Wellung laeuft in eine Richtung, wie bei echter Pappe. Die Rauheitskarte
 * folgt derselben Struktur, damit das Licht ueber die Wellen wandert statt
 * gleichmaessig zu streuen.
 */
export function wellpappeTexturen(): { farbe: Texture; rauheit: Texture } {
  if (wellpappe) return wellpappe;

  const kante = 512;
  const farbeCanvas = document.createElement("canvas");
  const rauheitCanvas = document.createElement("canvas");
  farbeCanvas.width = farbeCanvas.height = kante;
  rauheitCanvas.width = rauheitCanvas.height = kante;

  const f = farbeCanvas.getContext("2d")!;
  const r = rauheitCanvas.getContext("2d")!;

  f.fillStyle = "#C79A62";
  f.fillRect(0, 0, kante, kante);
  r.fillStyle = "#c8c8c8";
  r.fillRect(0, 0, kante, kante);

  // Wellung: weiche Streifen, etwa 6 mm Teilung.
  const teilung = 14;
  for (let x = 0; x < kante; x += teilung) {
    const verlauf = f.createLinearGradient(x, 0, x + teilung, 0);
    verlauf.addColorStop(0, "rgba(0,0,0,.055)");
    verlauf.addColorStop(0.5, "rgba(255,255,255,.045)");
    verlauf.addColorStop(1, "rgba(0,0,0,.055)");
    f.fillStyle = verlauf;
    f.fillRect(x, 0, teilung, kante);

    const rVerlauf = r.createLinearGradient(x, 0, x + teilung, 0);
    rVerlauf.addColorStop(0, "rgba(255,255,255,.10)");
    rVerlauf.addColorStop(0.5, "rgba(0,0,0,.10)");
    rVerlauf.addColorStop(1, "rgba(255,255,255,.10)");
    r.fillStyle = rVerlauf;
    r.fillRect(x, 0, teilung, kante);
  }

  // Papierfaser: feines Rauschen, sparsam dosiert.
  const bild = f.getImageData(0, 0, kante, kante);
  const rBild = r.getImageData(0, 0, kante, kante);
  for (let i = 0; i < bild.data.length; i += 4) {
    const rauschen = (Math.random() - 0.5) * 22;
    bild.data[i] += rauschen;
    bild.data[i + 1] += rauschen * 0.9;
    bild.data[i + 2] += rauschen * 0.7;
    const rRauschen = (Math.random() - 0.5) * 30;
    rBild.data[i] += rRauschen;
    rBild.data[i + 1] += rRauschen;
    rBild.data[i + 2] += rRauschen;
  }
  f.putImageData(bild, 0, 0);
  r.putImageData(rBild, 0, 0);

  const farbe = new CanvasTexture(farbeCanvas);
  farbe.colorSpace = SRGBColorSpace;
  const rauheit = new CanvasTexture(rauheitCanvas);

  for (const textur of [farbe, rauheit]) {
    textur.wrapS = textur.wrapT = RepeatWrapping;
    textur.repeat.set(3, 3);
    textur.minFilter = LinearFilter;
    textur.anisotropy = 4;
  }

  wellpappe = { farbe, rauheit };
  return wellpappe;
}

let etikett: Texture | null = null;

/**
 * Das Versandetikett – das Signature-Element.
 *
 * Bei einem Logistiker ist das Etikett der zentrale Gegenstand: Adressfeld,
 * Sendungsnummer in Monospace, Strichcode. Es sitzt auf dem Karton und gibt
 * der Szene ihren Bezug zur Marke.
 */
export function etikettTextur(): Texture {
  if (etikett) return etikett;

  const breite = 512;
  const hoehe = 320;
  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const g = canvas.getContext("2d")!;

  g.fillStyle = "#F7F9FB";
  g.fillRect(0, 0, breite, hoehe);

  // Kopfbalken in Markenblau.
  g.fillStyle = "#2D6FFF";
  g.fillRect(0, 0, breite, 56);
  g.fillStyle = "#FFFFFF";
  g.font = "bold 26px monospace";
  g.letterSpacing = "6px";
  g.fillText("WINTERFELD", 20, 38);
  g.font = "18px monospace";
  g.fillText("LOGISTIK", 300, 38);

  // Adressfeld.
  g.fillStyle = "#42536A";
  g.font = "17px monospace";
  g.fillText("AN", 20, 96);
  g.fillStyle = "#0A1018";
  g.font = "20px monospace";
  g.fillText("Musterstraße 1", 20, 124);
  g.fillText("12345 Musterstadt", 20, 150);

  // Strichcode – gleichmaessige Balken, kein echter Code.
  let x = 20;
  g.fillStyle = "#0A1018";
  while (x < breite - 20) {
    const dicke = 2 + Math.floor(Math.random() * 5);
    g.fillRect(x, 186, dicke, 74);
    x += dicke + 2 + Math.floor(Math.random() * 5);
  }

  g.fillStyle = "#42536A";
  g.font = "18px monospace";
  g.letterSpacing = "2px";
  g.fillText("WL 4711 8829 0031", 20, 292);

  etikett = new CanvasTexture(canvas);
  etikett.colorSpace = SRGBColorSpace;
  etikett.anisotropy = 4;
  return etikett;
}
