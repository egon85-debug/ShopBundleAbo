/**
 * Bildschirmaufnahmen des laufenden Shops.
 *
 * Hintergrund: Diese Oberfläche ist über Wochen entstanden, ohne dass sie je
 * jemand angesehen hat, der sie gebaut hat — geprüft wurden Typen, Bundle und
 * Tests, also alles, was ohne Augen geht. Das Ergebnis war entsprechend.
 * Dieses Skript schließt die Lücke: gestalterische Arbeit gilt erst als
 * fertig, wenn sie angesehen wurde.
 *
 * Playwright ist bewusst KEINE Projektabhängigkeit — es wird nur zum Ansehen
 * gebraucht, nicht zum Bauen oder Ausliefern:
 *
 *   npm install --no-save playwright
 *
 * Verwendung (Shop muss laufen, z. B. über `npm start`):
 *
 *   node shot.mjs                          → nach ./aufnahmen
 *   node shot.mjs /ziel/pfad               → dorthin
 *   BASIS=http://127.0.0.1:3000 node shot.mjs
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Chromium finden.
 *
 * In manchen Umgebungen liegt bereits ein Browser bereit (Playwright-Ablage),
 * dessen Versionsnummer nicht zu der der installierten Bibliothek passt.
 * Playwright sucht dann vergeblich. Statt einen zweiten Browser zu laden,
 * nehmen wir den vorhandenen.
 */
function chromiumPfad() {
  if (process.env.CHROMIUM_PFAD) return process.env.CHROMIUM_PFAD;
  const ablage = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!ablage || !existsSync(ablage)) return undefined;
  const kandidat = readdirSync(ablage)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .pop();
  if (!kandidat) return undefined;
  const voll = path.join(ablage, kandidat, "chrome-linux", "chrome");
  return existsSync(voll) ? voll : undefined;
}

const ZIEL = process.argv[2] ?? "./aufnahmen";
const BASIS = process.env.BASIS ?? "http://127.0.0.1:3000";
const BREITE = Number(process.env.BREITE ?? 1440);
const HOEHE = Number(process.env.HOEHE ?? 900);

/**
 * [Name, Pfad, Scrollposition in Pixeln, Wartezeit in ms, Zeiger-Ziel?]
 *
 * Das letzte Feld ist ein CSS-Wähler. Ist er gesetzt, fährt der Zeiger auf
 * dieses Element, bevor aufgenommen wird — anders lassen sich Zustände wie die
 * räumliche Ebene hinter den Kategoriekacheln gar nicht beurteilen, weil sie
 * erst beim Darüberfahren erwachen.
 */
const AUFNAHMEN = [
  ["01-hero", "/", 0, 4000],
  ["02-karton-oeffnet", "/", 1400, 2500],
  ["03-karton-offen", "/", 2600, 2500],
  ["04-reise", "/", 4200, 2000],
  ["05-warum-winterfeld", "/", 6200, 1500],
  ["06-kategorie-hover", "/", 7600, 3000, "[data-kategorie-kachel]"],
  ["07-shop", "/shop", 0, 2500],
  ["08-produkt", "/produkt/faltkarton-300-200-150-mm-20-stueck", 0, 3500],
];

await mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch({
  // In Containern ohne Grafikkarte rechnet SwiftShader WebGL auf der CPU –
  // sonst bliebe jede 3D-Szene auf den Aufnahmen schwarz.
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  executablePath: chromiumPfad(),
});
const seite = await browser.newPage({ viewport: { width: BREITE, height: HOEHE } });

for (const [name, pfad, scroll, warten, zeigerZiel] of AUFNAHMEN) {
  try {
    await seite.goto(BASIS + pfad, { waitUntil: "load", timeout: 30000 });
    await seite.waitForTimeout(1200);
    if (scroll) await seite.evaluate((y) => window.scrollTo(0, y), scroll);
    await seite.waitForTimeout(800);
    if (zeigerZiel) {
      const element = seite.locator(zeigerZiel).first();
      if (await element.count()) {
        await element.hover({ timeout: 5000 });
      } else {
        console.warn("kein Element für", zeigerZiel, "– Aufnahme ohne Zeiger");
      }
    }
    // Warten, bis Aufbau- und Scroll-Animationen ihren Endzustand erreicht haben.
    await seite.waitForTimeout(warten);
    await seite.screenshot({ path: `${ZIEL}/${name}.png` });
    console.log("aufgenommen:", name);
  } catch (fehler) {
    // Eine unerreichbare Seite darf die übrigen Aufnahmen nicht verhindern.
    console.error("fehlgeschlagen:", name, "—", (fehler instanceof Error ? fehler.message : fehler));
  }
}

await browser.close();
