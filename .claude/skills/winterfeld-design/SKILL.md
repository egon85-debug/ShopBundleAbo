---
name: winterfeld-design
description: Gestaltungsrichtung für den Winterfeld-Logistik-Shop — Farben, Schrift, Abstände, Radien, Regeln und bewusste Abweichungen. Vor jeder Änderung an der Storefront-Oberfläche lesen. Enthält die Prüfschritte, ohne die keine gestalterische Arbeit als fertig gilt.
---

# Gestaltung: Winterfeld Logistik

## Die Grundregel

**Gestalterische Arbeit ist erst fertig, wenn sie angesehen wurde.**

Ein grüner Build, saubere Typen und kleine Bundles sagen nichts über das
Aussehen. Vor jedem Push:

```bash
cd shop
npm install --no-save playwright     # einmalig je Umgebung
npm start &
node shot.mjs                        # Aufnahmen nach ./aufnahmen (Desktop + Handy)
```

Die Bilder dann **tatsächlich lesen** – Desktop und Handy – und dem
Auftraggeber vorlegen, bevor gepusht wird. Ohne Daten in der Datenbank zeigt
die Startseite keine Produkte; dann ist die Aufnahme wertlos (siehe README,
„gegen echte Daten bauen“).

## Richtung

Der Auftraggeber hat aus der Sammlung Refero Styles einen hellen,
zurückhaltenden Stil gewählt: viel Weiß, eine einzige Akzentfarbe (Orange),
leichte große Überschriften, flache Karten mit Haarlinie. Übernommen werden
**nur** Farben, Schriftgrößen, Abstände, Radien und Regeln – **nichts** von
der Marke selbst (kein Logo, keine Bilder, keine Texte, kein Markenname).

## Logo

Anhänger-Etikett in #ff6105 (Lochung und drei Zeilen ausgestanzt) plus
Wortmarke „**Winterfeld** Logistik“ in Inter 500/300. Dateien in
`shop/public/marke/`: `winterfeld-logistik.svg` (Standard),
`winterfeld-logistik-weiss.svg` (auf Orange oder dunklem Grund),
`zeichen.svg` (nur das Zeichen, auch Browsersymbol `src/app/icon.svg`).
Die Schrift ist in Pfade umgewandelt; nicht neu setzen, nicht verzerren,
nicht umfärben außer Weiß.

## Tokens (Tailwind, `shop/tailwind.config.ts`)

**Farben**

| Token | Hex | Einsatz |
|---|---|---|
| `akzent` | #ff6105 | nur: Hauptaktion, aktiver Schritt, Akzentlinie unter Überschriften, Fokusring |
| `glut` | #ffa069 | Hover-Nuancen des Akzents |
| `pfirsich` | #ffdfcd | hervorgehobene Karten (`karte-hervor`), Hinweise, Rabattplakette |
| `tinte` | #0a0a0a | Text, Überschriften |
| `kohle` | #292b2a | Fließtext |
| `schiefer` | #7a7b7b | Nebeninfos, Artikelnummern |
| `asche` | #a2a3a2 | inaktive Schritte, Platzhalter |
| `haarlinie` | #e5e5e5 | Kartenrand, Trennlinien |
| `nebel` / `knochen` | #dfe0df / #e5e7eb | Hover-Rand, feine Teiler |
| `leinen` | #f3f4f3 | Hinweisleiste, Fußzeile, Bildgrund |
| `anthrazit` | #202120 | das eine dunkle Band auf der Startseite |
| `rauch` | #3c3e3d | Text auf dunklem Grund |

**Schrift:** nur **Inter** (Google Fonts, frei nutzbar) in 300/400/500 – der
Ersatz für die lizenzierte Originalschrift. Kein Gewicht über 500.

| Token | Größe | Einsatz |
|---|---|---|
| `caption` | 12 | Augenbraue, Artikelnummer |
| `body-sm` | 14 | Navigation, Nebentext |
| `body` | 16 | Fließtext |
| `subheading` | 18 | Kartentitel, Einleitungen |
| `heading-sm` | 24 | Preise, Kartenüberschriften |
| `heading` | 32 | Abschnittsüberschriften (mobil) |
| `heading-lg` | 48 | Abschnittsüberschriften, Produktname |
| `display` | 72 | nur die eine Startseiten-Überschrift |

Große Überschriften: `font-light`, negative Laufweite (−0,01 bis −0,036 em),
darunter die orange Akzentlinie (2 × 120 px). Nie Versalien oder positive
Laufweite bei Überschriften (Augenbrauen in 12 px sind die Ausnahme).

**Radien:** `karte` 5 · `bild`/`klein` 8 · `sekundaer` 24 · `gross` 32 ·
`nav` 40 · `pille` 50 (Hauptknopf, Eingabefelder).

**Abstände:** Seitenbreite max. 1200 px (`.seite`), 80 px zwischen Abschnitten
(`pt-20` je Abschnitt, letzter mit `pb-20`), Karteninnenabstand 16–32 px.

**Schatten:** genau einer – das orange Leuchten unter `knopf-aktion`. Karten
sind flach.

## Bausteine (`shop/src/app/globals.css`, `components/ui/Gestaltung.tsx`)

- Knöpfe: `knopf-aktion` (orange, einmal je Sichtbereich), `knopf-nav`
  (Warenkorb oben), `knopf-zweit` (weiß mit Haarlinie), `knopf-geist`,
  `knopf-klein`, `textlink`
- Felder: `feld`, `feld-mehrzeilig`, `feldname`, `auswahl`
- Flächen: `karte`, `karte-hervor`, `plakette`, `plakette-aktiv`,
  `plakette-leise`, `plakette-hervor`, `hinweis-ok`, `hinweis-fehler`
- `Ueberschrift`, `ProduktBild`, `Verfuegbarkeit`

## Regeln

**Immer**
- Orange ist ein Satzzeichen: höchstens eine orange Hauptaktion je Sichtbereich.
- Produktbilder auf Leinen-Grund, `object-contain`, nie beschnitten.
- Zahlen in Preis- und Mengenspalten mit `tabular`; Artikel- und
  Bestellnummern **ohne** (sonst sperren die Bindestriche).
- Am Handy: Schrittanzeigen nur mit dem aktuellen Schritt („Schritt 2 von 5“),
  Kopfzeile darf nicht über den Rand ragen.

**Nie**
- eine zweite Akzentfarbe, Ampelfarben (grün/rot) für Status
- Schriftgewicht über 500, Versalien in Überschriften
- Schatten auf Karten, Verläufe, Glas-Effekte, 3D-Szenen, Scroll-Animationen
  (Bewegung gibt es nur an zwei Stellen: Einstiegsvideo mit Abspann und
  das Laufband „Neu im Shop“)
- Bilder, Texte oder Namen der Vorlage

## Laufband „Neu im Shop“

Unter der Hinweisleiste laufen die neuesten Artikel mit Bild und Preis
(`components/ui/NeuheitenBand.tsx`, Daten aus `neuheiten()` in
`services/navigation.ts`, 60 s zwischengespeichert). Es läuft mit 40 px/s,
hält bei Maus darüber und bei Tastaturfokus, lässt sich wischen, mit der Maus
ziehen und über Pfeile blättern; nach eigenem Eingreifen 3 s Pause. Der
Pausenknopf ist Pflicht (auch am Handy) – ohne ihn kann nur anhalten, wer eine
Maus hat. Bei reduzierter Bewegung läuft es nicht von allein. In Kasse und
Bestellbestätigung erscheint es nicht. Hinweisleiste und Laufband scrollen mit
weg, nur die Kopfzeile darunter klebt oben.

## Bewusste Abweichungen von der Vorlage (dem Auftraggeber gemeldet)

- **Einstieg mit Video statt Foto:** rechts neben der Überschrift ein mit
  Higgsfield erzeugtes Video (Seedance 2.0, 5 s, 1:1): Zuschnitt faltet sich
  zum Karton, oranges Klebeband verschließt ihn. Danach der **Abspann** als
  SVG über dem Video: „Lagernd · Verpackt · Versendet · Verfolgbar“ fahren
  von rechts ein, dann wird ein Versandetikett mit Logo auf die
  Kartonvorderseite gelegt. Schrift und Logo nie von der KI erzeugen lassen –
  sie verzerrt beides. Dateien in `shop/public/einstieg/`, Baustein
  `components/ui/EinstiegsVideo.tsx`, Bewegung in `globals.css`
  (`.abspann`). Einmal abspielen, Start bei halber Sichtbarkeit; bei
  reduzierter Bewegung sofort das Endbild mit Wörtern und Etikett.
  Das dunkle Band trägt weiterhin nur Text.
- **Statusfarben:** Erfolg auf Leinen, Fehler auf Pfirsich statt Grün/Rot.
- **Mehrzeilige Felder** mit Radius 24 statt 50 (50 wirkt bei Höhe > 1 Zeile
  wie eine Kapsel).
- **Produktnamen in Karten** 18 statt 24 px (lange Artikelnamen).
- **Keine Monospace-Schrift** für Artikelnummern – eine Schrift im ganzen Shop.
- **Kontrast:** Weiß auf #ff6105 erreicht nur 3,0 : 1 (WCAG AA verlangt
  4,5 : 1 für normalen Text). Die Vorlage gibt 7 : 1 an; das stimmt nicht.
  Offen: auf Wunsch des Auftraggebers dunkleres Orange für Knopftexte.
- **Rabattplakette** in Pfirsich statt Orange, **Kaufen** nur auf der
  Produktseite, **Cookie-Knöpfe** gleichgewichtet (kein Orange – keine
  Lenkung zur Zustimmung).
- Der **Adminbereich** behält sein eigenes, dunkles Erscheinungsbild.

## Prüfliste vor jedem Push

Anhand der Aufnahmen, nicht aus dem Kopf:

1. Höchstens ein oranger Hauptknopf je Bildschirmhöhe? → ja
2. Abstände zwischen Abschnitten 80 px, nirgends doppelt? → ja
3. Ragt am Handy etwas über den Rand (Kopfzeile, Tabellen, Knöpfe)? → nein
4. Überschriften leicht (300), keine Versalien, Akzentlinie darunter? → ja
5. Karten flach, Haarlinie, Radius 5? → ja
6. Sind Produktbilder vollständig sichtbar? → ja
