# Entwicklungsphasen & MVP-Abgrenzung

## Phasen (Auftrag §37)

| Phase | Inhalt | Stand in diesem Repo |
|---|---|---|
| 1 Architektur | Systemarchitektur, DB-Modell, API, KI-Pipeline, Sync, Shop, Sicherheit | ✅ `docs/` |
| 2 UX/UI | Screens & Userflows | ✅ Compose-Screens in `android/`, Admin in `admin/` |
| 3 Datenbank | Relationales Modell, Migrationen, Constraints, Indizes | ✅ `backend/app/models/`, `backend/migrations/` |
| 4 Backend | API, Auth, Uploads, KI-Orchestrierung, Jobs, Shop-Connector, Logging | ✅ `backend/app/` |
| 5 Android | Tablet-App mit Kamera, Barcode, Mikrofon, Offline-Queue, Sync | ✅ `android/` (Build erfordert Android SDK) |
| 6 KI | Vision/OCR, STT, Extraktion, Recherche, Preisvergleich, Shoptexte, Bildoptimierung | ✅ Provider + Job-Handler (Keys via Env) |
| 7 Shop | Abstraktion + WooCommerce-Referenz-Connector | ✅ `backend/app/connectors/` |
| 8 Tests | Unit/API/DB/Sync/KI-Validierung/Publishing | ✅ `backend/tests/` |

## MVP (in diesem Repo umgesetzt)

- Vollständiger Erfassungs-Workflow: Foto → Vision-Erkennung → Sprache → Extraktion →
  Merge mit Confidence/Provenienz → Rückfragen → Kontrollbildschirm → Dublettenprüfung →
  Speichern → Bildoptimierung → Shoptext → Qualitätsprüfung → Veröffentlichung (WooCommerce).
- Bestandsführung ausschließlich über Movements, Audit-Log, Preis-Historie.
- Offline-Puffer + Upload-Queue + Idempotenz auf dem Tablet.
- Rollen (Mitarbeiter, Lagerleiter, Shop-Manager, Admin), Adminbereich (Benutzer,
  Lieferanten, Lagerplätze, Shop-Verbindungen, Jobs/Fehler, Audit-Log, Systemstatus).
- Provider-Abstraktion mit realen HTTP-Implementierungen (Anthropic Vision/LLM,
  Whisper-kompatible STT, konfigurierbare Preisrecherche-API, Pillow-Bildpipeline,
  Local-/S3-Storage).

## Bewusst spätere Ausbaustufen (nicht MVP)

- Weitere Shop-Connectoren (Shopify, Shopware, Magento, Marktplätze) — Interface steht.
- QR-Codes an Lagerplätzen („Lagerplatz scannen, dann mehrere Artikel erfassen“) —
  Datenfeld `qr_code_value` ist vorbereitet.
- Visuelle Ähnlichkeitssuche für Dubletten (Embedding-Index); MVP prüft EAN/MPN/SKU/
  Hersteller+Modell/Namens-Ähnlichkeit.
- Automatischer periodischer „Marktpreise aktualisieren“-Lauf (manuell je Produkt ist da).
- Web-Erfassungsclient; Mehrmandanten-Fähigkeit; Push-Benachrichtigungen.
- Redis/Celery-Queue bei stark wachsender Last (JobQueue-Interface vorhanden).

## Betriebshinweise

- Externe KI-/Recherche-Provider benötigen Env-Keys (`backend/.env.example`). Ohne Keys
  laufen die zugehörigen Jobs kontrolliert auf Fehler+Retry und der Artikel bleibt
  erfasst — es gehen nie Daten verloren; die Erfassung selbst funktioniert weiter.
- Android-Build benötigt lokal ein Android SDK (Repo enthält vollständige Quellen +
  Gradle-Konfiguration; in der CI-Umgebung dieses Repos wird nur das Backend gebaut/getestet).
