# KI-Pipeline & KI-Datenmodell

## Grundsätze (Anforderungen 4, 10, 26, 38)

1. KI-Ausgaben werden **nie** ungeprüft in Fachfelder geschrieben. Ablauf immer:
   Provider → strukturierte JSON-Ausgabe → Pydantic-Schema-Validierung → fachliche
   Validierung (EAN-Prüfziffer, Decimal-Parsing, Wertebereiche) → Ablage als *Vorschlag*
   mit Confidence und Quelle (`field_sources[feld] = "ai" | "research"`).
2. Benutzerangaben (`source = "user"`) überschreiben KI-/Recherche-Werte — nie umgekehrt.
3. Felder mit Confidence unter Schwellwert (konfigurierbar, Default 0.85) erzeugen eine
   Markierung im Kontrollbildschirm; fehlende Pflichtinfos erzeugen gezielte Rückfragen.
4. Jeder Provider-Aufruf wird als `ai_runs`-Datensatz protokolliert (Provider, Modell,
   Roh-Ausgabe, validierte Ausgabe, Dauer, Fehler).

## Pipeline nach dem ersten Foto

```
Foto-Upload ──▶ Job recognize_product
                 ├─ Barcode-Dekodierung (lokal auf dem Tablet via ML Kit; serverseitig
                 │  zusätzlich aus dem Bild, Ergebnis mit Prüfziffern-Validierung)
                 ├─ VisionProvider.analyze(image) → Hersteller, Marke, Produktname, Modell,
                 │  MPN, EAN, Kategorie, Farbe, Zustand, OCR-Texte … je Feld mit Confidence
                 └─ Merge in Produkt-Entwurf (source=ai)
        ──▶ Job research_product   (wenn EAN/MPN/eindeutige Bezeichnung vorhanden)
                 ├─ PriceResearchProvider.identify(ean|mpn|name)
                 ├─ 1 Treffer → Merge (source=research)
                 └─ n Treffer → candidates am Capture, Rückfrage „Mehrere mögliche Artikel“
        ──▶ Job research_prices
                 ├─ Nur vergleichbare Angebote (gleiche Variante/Gebinde/Zustand) → is_comparable
                 ├─ Ausreißer-Erkennung (IQR-Regel) → is_outlier
                 ├─ price_research_runs-Eintrag (Historie) + Min/Max/Ø/Median am Produkt
                 └─ Verkaufspreis-Vorschlag (konfigurierbare Strategie, Default: Median − 5 %,
                    nie unter Mindestpreis/EK)
        ──▶ Job optimize_images    (je Originalbild → separates Shopbild, Original bleibt)
        ──▶ Job generate_shoptext  (nur aus verifizierten/bestätigten Feldern)
```

## Sprach-Pipeline

```
Audio (oder On-Device-Transkript) ──▶ Job transcribe (SpeechToTextProvider)
    ──▶ Job extract_voice_data (LlmExtractor mit striktem JSON-Schema)
    ──▶ Validierung + Merge (source=ai, aber vom Mitarbeiter GESPROCHENE Werte werden im
        Kontrollbildschirm zur Bestätigung angezeigt; nach Bestätigung source=user)
    ──▶ Lieferanten-Fuzzy-Match (bekannter Name → supplier_id)
    ──▶ Lagerplatz-Auflösung („Halle zwei Regal B vier“ → H2/…/B4)
    ──▶ Rückfragen-Erzeugung (fehlender Bestand, netto/brutto unklar, EAN-Konflikt …)
```

## Extraktions-Schema (LlmExtractor)

```json
{
  "stock": 14,
  "purchase_price_net": "28.50",
  "purchase_price_gross": null,
  "sale_price": "59.00",
  "minimum_sale_price": null,
  "supplier_name": "Müller Großhandel",
  "purchase_date": null,
  "invoice_number": null,
  "storage_location_spoken": "Halle 2 Regal B4",
  "condition": "new",
  "packaging_condition": "originalverpackt",
  "damaged_count": 3,
  "batch_number": null,
  "serial_number": null,
  "notes": "Drei Verpackungen mit leichten Lagerspuren",
  "confidence": {"stock": 0.97, "purchase_price_net": 0.95, "supplier_name": 0.9}
}
```

Pydantic-Schema: `backend/app/schemas/ai.py` (`VoiceExtraction`, `VisionAnalysis`,
`ShopTextGeneration`). Preise sind Strings/Decimal, nie Float. Unbekanntes = `null`,
niemals geraten (Prompt-Regel + Schema erlaubt `null`).

## Rückfragen-Logik (Anforderung 9)

`services/questions.py` erzeugt aus dem Merge-Ergebnis eine minimale Liste offener Fragen,
priorisiert: (1) Konflikte (Foto-EAN ≠ Recherche-EAN), (2) fehlender Bestand,
(3) netto/brutto unklar, (4) mehrdeutige Produktkandidaten. Ziel ist Geschwindigkeit —
Fragen werden gebündelt im Kontrollbildschirm gestellt, nicht einzeln modal.

## Bildoptimierung (Anforderung 14)

- Original → `product_images(kind=original)`, unveränderlich.
- Optimierung erzeugt neuen Datensatz `kind=optimized, source_image_id=…`.
- Pipeline: EXIF-Rotation → optionale Freistellung (externer Provider) → Weißabgleich →
  Belichtung → Zuschnitt/Zentrierung → einheitliches Seitenverhältnis (1:1, weißer Rand) →
  Zielauflösung. Keine generative Veränderung des Produkts; Bilder mit `role=damage`
  werden bewusst **nicht** „verschönert“ (nur Belichtung/Zuschnitt).

## Shoptexte (Anforderung 15)

Prompt erhält ausschließlich Felder mit `source in (user, research)` oder
`confidence ≥ Schwellwert`; unsichere Felder werden explizit als „nicht verifiziert“
markiert übergeben und dürfen laut Prompt + Nachvalidierung nicht als Fakt formuliert
werden. Ausgabe (Titel, Kurz-/Langbeschreibung, Bullets, Meta, Slug, Tags) landet in
`shop_listings` und ist vor Veröffentlichung editierbar.
