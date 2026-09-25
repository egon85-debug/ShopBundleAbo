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
 *   PRODUKT=/produkt/<slug> node shot.mjs  → anderes Produkt
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
const PRODUKT = process.env.PRODUKT ?? "/produkt/faltkarton-300x200x150-20er";

/** Jede Seite einmal am Desktop und einmal in Handybreite, jeweils ganz. */
const GERAETE = [
  ["desktop", 1440, 900],
  ["handy", 390, 844],
];

await mkdir(ZIEL, { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPfad() });

for (const [geraet, breite, hoehe] of GERAETE) {
  const kontext = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const seite = await kontext.newPage();

  async function aufnehmen(name, pfad) {
    try {
      if (pfad) await seite.goto(BASIS + pfad, { waitUntil: "networkidle", timeout: 30000 });
      // Einmal durchscrollen, damit nachgeladene Produktbilder auf dem Bild sind.
      await seite.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((fertig) => setTimeout(fertig, 60));
        }
        window.scrollTo(0, 0);
      });
      await seite.waitForTimeout(500);
      await seite.screenshot({ path: `${ZIEL}/${geraet}-${name}.png`, fullPage: true });
      console.log("aufgenommen:", `${geraet}-${name}`);
    } catch (fehler) {
      // Eine unerreichbare Seite darf die übrigen Aufnahmen nicht verhindern.
      console.error("fehlgeschlagen:", name, "—", fehler instanceof Error ? fehler.message : fehler);
    }
  }

  await aufnehmen("01-start", "/");
  await aufnehmen("02-shop", "/shop");
  await aufnehmen("03-produkt", PRODUKT);

  // Warenkorb und Kasse sind nur mit Inhalt aussagekräftig.
  try {
    await seite.getByRole("button", { name: "In den Warenkorb" }).click({ timeout: 5000 });
    await seite.waitForTimeout(1500);
  } catch {
    console.warn("Produkt ließ sich nicht in den Warenkorb legen – Warenkorb bleibt leer");
  }
  await aufnehmen("04-warenkorb", "/warenkorb");
  await aufnehmen("05-kasse", "/kasse");
  await aufnehmen("06-konto", "/konto");
  await aufnehmen("07-versand", "/versand");
  await aufnehmen("08-impressum", "/impressum");
  await aufnehmen("09-nicht-gefunden", "/diese-seite-gibt-es-nicht");

  await kontext.close();
}

await browser.close();
