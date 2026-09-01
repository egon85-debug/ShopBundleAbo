---
name: winterfeld-design
description: Gestaltungsrichtung für den Winterfeld-Logistik-Shop — Materialien, Licht, 3D-Szenen, Bewegung, Beschriftung. Vor jeder Änderung an Oberfläche, 3D-Szenen oder Animationen lesen. Enthält die Referenzrichtung des Auftraggebers und die Prüfschritte, ohne die keine gestalterische Arbeit als fertig gilt.
---

# Gestaltung: Winterfeld Logistik

## Die Grundregel

**Gestalterische Arbeit ist erst fertig, wenn sie angesehen wurde.**

Ein grüner Build, saubere Typen und kleine Bundles sagen nichts über das
Aussehen. Diese Oberfläche ist über Wochen blind entstanden und war
entsprechend schlecht. Vor jedem Push:

```bash
npm install --no-save playwright     # einmalig je Umgebung
npm start &
node shot.mjs                        # Aufnahmen nach ./aufnahmen
```

Die Bilder dann **tatsächlich lesen** und dem Auftraggeber vorlegen, bevor
gepusht wird.

## Referenzrichtung

Der Auftraggeber hat als Vorbild eine Arbeit von `marina_uiux` genannt: eine
fiktive Wohnkapsel-Seite („B2 Block"). Was daran gilt:

**1. Material vor Form.** Gesteppte Polsterung, gebürstetes Metall mit Nieten,
Glas, Landschaft mit Tiefenunschärfe. Ein Körper ohne Oberfläche ist kein
Gegenstand, sondern ein Platzhalter. Für Winterfeld heißt das:

| Produkt | Material |
|---|---|
| Faltkarton | Wellpappe: Faserstruktur, matte Streuung, dunklere Schnittkanten, leicht gebrochene Ecken |
| Transportbox | Kunststoff: leicht glänzend, weiche Glanzlichter an den Kanten |
| Packband | halbtransparente Wicklung über Pappkern |
| Luftpolsterfolie | durchscheinend, unregelmäßige Wölbungen |
| Regal, Lager | Stahl: kühl, leicht metallisch, gerichtete Reflexe |

**2. Warm gegen kalt.** In der Referenz Rostorange gegen Cyan. Für Winterfeld
liegt dasselbe Prinzip bereits im Designsystem: die warme Wellpappe und
`beacon` (#FFB020) gegen `carbon` (#070B11) und `signal` (#2D6FFF). Warm ist
die Ware, kalt ist der Raum.

**3. Ein wiederkehrendes Signature-Element.** In der Referenz die Plakette mit
leuchtender Umrandung in ihrem Metallgehäuse — in jedem Bild dieselbe. Für
Winterfeld ist das naheliegende Gegenstück das **Versandetikett**: eine Platte
mit Signalblau-Rand, Sendungsnummer in Monospace, kleiner Statuspunkt. Das
Etikett ist bei einem Logistiker ohnehin das zentrale Objekt.

**4. Beschriftung wie an einem Messgerät.** Kleine Monospace-Anmerkungen in den
Ecken, nie mittig, nie groß:

```
// 300 × 200 × 150 mm
// zweiwellig · FEFCO 0201
// 120 auf Lager
```

Dazu winzige Statuspunkte (grün = lieferbar, bernstein = knapp). JetBrains Mono
ist dafür schon im System — es trägt bereits SKU und Sendungsnummern.

**5. Die Schrift ist ruhig, das Bild ist laut.** Die Wirkung kommt aus der
Szene, nicht aus riesigen Überschriften.

## Was bewusst NICHT übernommen wird

- **Die Science-Fiction-Erzählung.** Winterfeld verkauft Kartons und Packband.
  Aus dem Vorbild kommt die Machart, nicht die Welt.
- **Rot als Leitfarbe.** Es würde gegen das Markenblau arbeiten. Warm bleibt
  Wellpappe und Bernstein.
- **Bildschirmfüllende fotorealistische Landschaften.** Zu schwer für einen
  Shop und thematisch daneben.

## 3D: was eine Szene tragbar macht

**Immer:**
- **Kontaktschatten.** Ohne ihn schwebt jeder Gegenstand. Ein weicher Schatten
  unter dem Objekt kostet fast nichts und ändert alles.
- **Drei Lichter statt einem.** Führungslicht schräg oben, kühles Gegenlicht
  hinten für die Kantenzeichnung, schwaches Aufhelllicht.
- **Umgebungsreflexion.** Ohne Environment Map wirken Kunststoff und Metall wie
  Pappe. Eine kleine, prozedural erzeugte reicht.
- **Gebrochene Kanten.** Reale Gegenstände haben keine mathematisch scharfen
  Kanten; ein schmaler Fasenrand fängt Licht und macht den Unterschied.

**Nie:**
- Objekte dort platzieren, wo Text steht. Die Schriftzone bleibt frei — oder
  die Fläche dahinter wird abgedunkelt.
- Alles gleichzeitig und gleich schnell bewegen. Gestaffelt, unterschiedlich
  schnell, mit klarer Ruhelage.
- Mehr als ein Blickfang je Bildschirmhöhe.

## Prüfliste vor jedem Push

Anhand der Aufnahmen, nicht aus dem Kopf:

1. Kollidiert ein 3D-Objekt mit Text? → nein
2. Hat jedes Objekt einen Kontaktschatten? → ja
3. Ist die Kopfzeile über dunklen Abschnitten lesbar? → ja
4. Erkennt man die Gegenstände ohne Beschriftung? → ja
5. Ist irgendwo Bewegung, die nichts erklärt? → nein
6. Bei `prefers-reduced-motion`: steht alles sofort und vollständig? → ja
