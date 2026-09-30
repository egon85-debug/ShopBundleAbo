# Architektur & Technologieentscheidungen

## 1. Zusammenfassung des Systems

Winterfeldt Logistik ist ein Client-Server-System zur schnellen Lagerartikel-Erfassung:

1. **Android-Tablet-App** (Kotlin + Jetpack Compose): Kamera, Barcode, Mikrofon,
   Offline-Puffer, Upload-Queue, touch-optimierte Kontroll- und Verwaltungs-Screens.
2. **Backend-API** (Python/FastAPI): Authentifizierung, Produktdatenhaltung,
   Dublettenprüfung, Bestands- und Audit-Logik, Datei-Uploads, KI-Orchestrierung.
3. **Background-Worker** (gleicher Codebestand, eigener Prozess): führt alle
   zeitintensiven Aufgaben asynchron aus — Bilderkennung, OCR, Produkt-/Preisrecherche,
   Sprachauswertung, Bildoptimierung, Shoptext-Generierung, Shop-Publikation.
4. **PostgreSQL** als zentrale Datenbank, **Objekt-Storage** (S3-kompatibel oder lokales
   Dateisystem) für Bilder und Audio.
5. **Web-Adminbereich** (responsiv, vom Backend ausgeliefert) für Benutzer-, Rollen-,
   Stammdaten- und Systemverwaltung.

## 2. Technologieentscheidungen mit Begründung

| Baustein | Entscheidung | Begründung |
|---|---|---|
| Android-App | Kotlin + Jetpack Compose, CameraX, ML Kit Barcode, Android `SpeechRecognizer`/STT-Upload, Room, WorkManager, Retrofit | Vorgabe des Auftrags (modern nativ); Compose ist der aktuelle Android-Standard, CameraX abstrahiert Gerätevielfalt, Room+WorkManager sind die robustesten Bausteine für Offline-Queue und Hintergrund-Sync. |
| Backend | Python 3.11 + FastAPI + Pydantic v2 | Erstklassige Schema-Validierung (Pflicht für KI-Ausgaben, Anforderung 26), automatische OpenAPI-Doku, großes Ökosystem für KI-/HTTP-Integration, geringe Betriebskosten, sehr gute Wartbarkeit. |
| ORM / Migrationen | SQLAlchemy 2.0 + Alembic | De-facto-Standard, ausgereifte Migrationen, präzise Kontrolle über Constraints/Indizes. |
| Datenbank | PostgreSQL ≥ 14 | Vorgabe; `NUMERIC` für Geldbeträge, JSONB für Attribute/KI-Rohdaten, `FOR UPDATE SKIP LOCKED` für die Job-Queue, Volltext-/Trigram-Suche für Dubletten. |
| Job-Queue | PostgreSQL-basierte Queue (Tabelle `jobs`, `FOR UPDATE SKIP LOCKED`, Exponential-Backoff-Retry) | Keine zusätzliche Infrastruktur (Redis/RabbitMQ) nötig, transaktional konsistent mit den Fachdaten („Job entsteht atomar mit dem Datensatz“), für die Zielgröße (eine bis wenige Erfassungsstationen) mehr als ausreichend; das Interface `JobQueue` erlaubt späteren Wechsel auf Celery/Redis ohne Änderung der Handler. |
| Auth | JWT (kurzlebige Access- + rotierende Refresh-Tokens), PBKDF2-Passwort-Hashing, rollenbasierte Autorisierung | Stateless für die API, Refresh-Rotation begrenzt Token-Diebstahl, keine externen Identity-Dienste nötig (später via Interface austauschbar). |
| Objekt-Storage | Interface `ObjectStorage` mit Implementierungen `LocalObjectStorage` (Default) und `S3ObjectStorage` | Lokal lauffähig ohne Cloud-Konto; S3-kompatibel (AWS, MinIO, Hetzner, …) für Produktion. |
| KI-Provider | Interfaces (`VisionProvider`, `SpeechToTextProvider`, `LlmExtractor`, `PriceResearchProvider`, `ImageOptimizer`) + konkrete HTTP-Implementierungen (Anthropic Claude für Vision/OCR/Extraktion/Shoptexte, Whisper-kompatible STT-API, konfigurierbare Recherche-API) | Anforderung 34: Anbieter müssen austauschbar sein. Alle Keys liegen ausschließlich serverseitig in Env-Variablen. |
| Bildoptimierung | Pipeline auf Pillow-Basis (Belichtung, Weißabgleich, Zuschnitt, Zentrierung, einheitliches Seitenverhältnis, Auflösung) + optionaler externer Freisteller (HTTP-API) | Grundoptimierung ohne externe Kosten lauffähig; Hintergrundentfernung als austauschbarer Provider. Originale werden nie überschrieben. |
| Shop-Anbindung | `ShopConnector`-Interface + WooCommerce-REST-Connector als Referenz | Anforderung 16: modular, Adapter-Konzept; WooCommerce hat eine offene, stabile REST-API und eignet sich als vollständige Referenzimplementierung. |
| Admin-Web | Serverseitig ausgeliefertes, responsives SPA-Frontend (Vanilla JS + Fetch auf dieselbe REST-API) | Kein zweiter Build-Stack nötig, nutzt exakt die abgesicherte API; kann später durch React/Vue ersetzt werden, ohne die API zu ändern. |

## 3. Backend-Schichten

```
app/
├── api/          # FastAPI-Router (nur HTTP-Belange: Parsing, Statuscodes, Auth-Abhängigkeiten)
├── services/     # Fachlogik (Produkt, Dubletten, Bestand, Merge, Preis, Qualität, Audit)
├── models/       # SQLAlchemy-Modelle (eine Datei je Aggregat)
├── schemas/      # Pydantic-Schemas (Request/Response + KI-Ausgabe-Schemas)
├── providers/    # Austauschbare externe Dienste (Interfaces + Implementierungen)
├── connectors/   # Shop-Adapter (Interface + WooCommerce)
├── jobs/         # Queue, Worker, Job-Handler (KI-Pipeline-Schritte)
└── utils/        # EAN-Prüfziffer, Geld, Slugs, …
```

Regeln:

- Router enthalten keine Fachlogik; Services kennen kein HTTP.
- Services schreiben **nie** direkt Bestand oder kritische Felder ohne Audit-/Movement-Eintrag.
- Provider werden über eine Registry (`providers/registry.py`) anhand der Konfiguration
  aufgelöst; Handler und Services programmieren ausschließlich gegen die Interfaces.
- KI-Ausgaben durchlaufen immer: JSON-Schema-Validierung (Pydantic) → fachliche Validierung
  (EAN-Prüfziffer, Wertebereiche, Decimal-Parsing) → Ablage als *Vorschlag* mit Confidence,
  nie als bestätigter Fakt.

## 4. Statusmodell eines Artikels (`processing_status`)

```
photo_uploaded → recognition_running → product_identified → price_research_running
              → images_optimizing → shoptext_generating → review_required
              → shop_ready → published        (jederzeit möglich: error → Retry)
```

`publication_status`: `draft | ready | publishing | published | publish_failed`.
Fehler blockieren nie die Erfassung: Der Artikel bleibt gespeichert, der Job wird mit
Exponential-Backoff erneut versucht (Anforderung 31).

## 5. Nebenläufigkeit / Hintergrundverarbeitung

- Jeder Upload erzeugt sofort einen persistierten `Job` (z. B. `recognize_product`).
- Der Worker holt Jobs mit `SELECT … FOR UPDATE SKIP LOCKED`, führt sie aus und kettet
  Folgejobs (Preisrecherche, Bildoptimierung, Shoptext) an.
- Die Erfassung am Tablet ist dadurch nie blockiert: Artikel B kann fotografiert werden,
  während Artikel A noch verarbeitet wird (Anforderung 20).
- Retry: `attempts < max_attempts`, Verzögerung `base * 2^attempts` mit Jitter; endgültig
  fehlgeschlagene Jobs erscheinen im Adminbereich unter „Synchronisationsfehler“.

## 6. Skalierungspfad

- API und Worker sind getrennte Prozesse → horizontal skalierbar (mehrere Worker möglich,
  `SKIP LOCKED` verhindert Doppelverarbeitung).
- Objekt-Storage und DB sind extern → API bleibt stateless (bis auf Refresh-Token-Tabelle).
- Später ergänzbar ohne Umbau: Web-Erfassungsclient (nutzt dieselbe API), Redis-Queue
  (JobQueue-Interface), Marktplatz-Connectoren (ShopConnector-Interface).
