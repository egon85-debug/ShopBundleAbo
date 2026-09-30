# Winterfeldt Logistik

**Blitzschnelle digitale Erfassung von Lagerartikeln per Android-Tablet.**

Der zentrale Arbeitsablauf:

> Artikel fotografieren → KI erkennt Produkt → Spracheingabe startet → Produktdaten werden
> recherchiert und ergänzt → Mitarbeiter bestätigt → Artikel wird gespeichert → Produktbilder
> werden für den Verkauf optimiert → Shop-Angebot wird vorbereitet → Veröffentlichung mit einem Klick.

## Systemüberblick

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Android Tablet App │  HTTPS │   Backend API (FastAPI)  │
│  Kotlin + Compose   │───────▶│   REST + JWT-Auth        │
│  Offline-Queue      │        │   Application Services   │
└─────────────────────┘        └────────────┬─────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
             ┌────────────┐        ┌──────────────┐        ┌──────────────┐
             │ PostgreSQL │        │ Objekt-      │        │ Background   │
             │ (Artikel,  │        │ Storage      │        │ Job Worker   │
             │  Historie, │        │ (Bilder,     │        │ (KI, Preise, │
             │  Audit)    │        │  Original+   │        │  Bilder,     │
             └────────────┘        │  Shop)       │        │  Shoptexte)  │
                                   └──────────────┘        └──────┬───────┘
                                                                  │ Provider-Interfaces
                    ┌──────────┬──────────┬──────────┬────────────┼──────────┐
                    ▼          ▼          ▼          ▼            ▼          ▼
                 Vision      OCR /     Speech-    LLM-Extrak-  Preis-     Shop-
                 AI          Barcode   to-Text    tion         recherche  Connector
                                                                          (WooCommerce, …)
```

## Repository-Struktur

| Pfad        | Inhalt |
|-------------|--------|
| `backend/`  | FastAPI-Backend, PostgreSQL-Modelle, Alembic-Migrationen, Job-Worker, Provider, Shop-Connector, Tests |
| `android/`  | Native Android-Tablet-App (Kotlin, Jetpack Compose, Room, CameraX, WorkManager) |
| `backend/admin/` | Responsiver Web-Adminbereich (wird vom Backend unter `/admin` ausgeliefert) |
| `docs/`     | Architektur, Datenbankschema, API-Konzept, KI-Workflows, Sync-, Shop-, Sicherheitskonzept, MVP-Abgrenzung |

## Schnellstart Backend (lokal)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # Secrets/Provider-Keys eintragen (niemals committen!)
alembic upgrade head          # Datenbank migrieren (PostgreSQL, s. .env)
python -m app.cli create-admin --email admin@example.com  # ersten Admin anlegen

uvicorn app.main:app --reload             # API auf http://localhost:8000
python -m app.jobs.worker                 # Background-Worker (separater Prozess)
```

API-Dokumentation (OpenAPI/Swagger): `http://localhost:8000/docs`
Adminbereich: `http://localhost:8000/admin`

### Tests

```bash
cd backend && pytest
```

Die Tests laufen ohne externe Dienste (SQLite in-memory, Provider über Test-Doubles an den
definierten Interfaces). Integrationstests gegen PostgreSQL: `DATABASE_URL` setzen und
`pytest -m integration`.

## Schnellstart Android

```bash
cd android
./gradlew assembleDebug     # benötigt Android SDK (compileSdk 35)
```

Die Basis-URL des Backends wird beim ersten Start in der App konfiguriert (Einstellungen →
Server) und verschlüsselt gespeichert. Es sind **keine** API-Keys im Client hinterlegt –
sämtliche externen KI-/Recherche-Aufrufe laufen über das Backend.

## Wichtige Eigenschaften

- **Kein Datenverlust**: Fotos und Eingaben werden auf dem Tablet in einer Room-Datenbank
  gepuffert und über eine Upload-Queue (WorkManager) synchronisiert, sobald Verbindung besteht.
- **KI-Ausgaben sind niemals Fakten**: Jedes automatisch erkannte Feld trägt einen
  Confidence-Wert; unsichere Felder werden im Kontrollbildschirm markiert. Benutzerangaben
  haben immer Vorrang (Feld-Provenienz `user` > `research` > `ai`).
- **Geldbeträge** werden durchgängig als `NUMERIC(12,2)`/`Decimal` bzw. Cent-Ganzzahlen geführt.
- **Jede Bestandsänderung** erzeugt einen `stock_movements`-Eintrag; jede relevante Änderung
  einen `audit_log`-Eintrag (Benutzer, Feld, alter/neuer Wert, Zeitpunkt).
- **Originalbilder bleiben unangetastet**; KI-optimierte Shopbilder werden separat gespeichert.
- **Provider-Abstraktion**: Vision, OCR, STT, LLM, Preisrecherche, Bildoptimierung, Storage und
  Shopsystem sind austauschbare Interfaces mit konfigurierbaren Implementierungen.

## Dokumentation

- [Architektur & Technologieentscheidungen](docs/architecture.md)
- [Datenbankschema](docs/database.md)
- [API-Konzept](docs/api.md)
- [KI-Pipeline & Datenmodell](docs/ai-pipeline.md)
- [Offline-Synchronisation](docs/sync.md)
- [Shop-Integration](docs/shop-integration.md)
- [Sicherheits- & Datenschutzkonzept](docs/security.md)
- [Android-App-Struktur](docs/android.md)
- [Entwicklungsphasen & MVP-Abgrenzung](docs/roadmap.md)
