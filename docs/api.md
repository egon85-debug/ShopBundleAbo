# API-Konzept

REST-API unter `/api/v1`, JSON, JWT-Bearer-Auth. Vollständige, stets aktuelle
Spezifikation: OpenAPI unter `/docs` bzw. `/openapi.json`.

## Authentifizierung

| Endpoint | Beschreibung |
|---|---|
| `POST /auth/login` | E-Mail + Passwort → Access-Token (15 min) + Refresh-Token (14 Tage, rotierend) |
| `POST /auth/refresh` | Refresh-Token → neues Token-Paar (alter Token wird widerrufen) |
| `POST /auth/logout` | Refresh-Token widerrufen |
| `GET /auth/me` | eigener Benutzer + Rolle |

Autorisierung pro Endpoint über Rollen (`employee < warehouse_manager/shop_manager < admin`),
serverseitig erzwungen; das UI blendet zusätzlich nur aus.

## Erfassungs-Workflow (Capture)

| Endpoint | Beschreibung |
|---|---|
| `POST /captures` | Neue Erfassung eröffnen → legt Produkt-Entwurf (`draft`) mit `internal_sku` an; idempotent über `client_capture_id` (Offline-Sync!) |
| `POST /captures/{id}/images` | Foto-Upload (multipart, `role`=front/back/…); erstes Foto stößt automatisch den Job `recognize_product` an |
| `POST /captures/{id}/voice` | Audio-Upload **oder** Client-Transkript → Jobs `transcribe`/`extract_voice_data` |
| `GET /captures/{id}` | Aktueller Zustand: erkannte Felder inkl. Confidence + Quelle, Rückfragen (`open_questions`), Kandidatenliste bei mehrdeutiger Produktrecherche, Dubletten-Hinweis |
| `POST /captures/{id}/answers` | Antworten auf Rückfragen / Kandidatenauswahl / Feldkorrekturen (werden als `source=user` gemerged) |
| `POST /captures/{id}/confirm` | Kontrollbildschirm bestätigt → Artikel wird endgültig gespeichert; Antwort enthält ggf. Dubletten-Treffer mit Optionen |
| `POST /captures/{id}/confirm?duplicate_action=increase_stock&duplicate_id=…` | Statt Neuanlage Bestand des bestehenden Artikels erhöhen |

Fehlende Verbindung: Das Tablet puffert alle diese Aufrufe in seiner Upload-Queue und
spielt sie idempotent nach (`client_capture_id`, `Idempotency-Key`-Header).

## Produkte & Bestand

- `GET /products` (Suche, Filter: Status, Kategorie, Lagerplatz, Volltext), `GET /products/{id}`
- `PATCH /products/{id}` — Feldänderungen (auditiert, Quelle `user`)
- `POST /products/{id}/stock-movements` — einzige Schreiboperation für Bestand
- `GET /products/{id}/stock-movements`, `GET /products/{id}/price-history`
- `GET /products/{id}/images`, `POST /products/{id}/images`, `PATCH /images/{id}` (Primärbild, Reihenfolge)
- `POST /products/{id}/reprice` — „Marktpreise aktualisieren“ (neuer Recherche-Lauf)
- `GET /products/{id}/quality` — Shopbereitschafts-Prüfung mit konkreter Mängelliste

## Stammdaten

- `GET|POST|PATCH /suppliers`, `GET /suppliers/match?name=…` (Fuzzy-Match für Spracheingabe)
- `GET|POST|PATCH /storage-locations` (Baum), `GET /storage-locations/resolve?spoken=Halle 2 Regal B4`

## Shop

- `GET|POST|PATCH /shop/connections` (Admin; Credentials werden verschlüsselt gespeichert, nie zurückgegeben)
- `GET /products/{id}/listing` / `PATCH …/listing` — generierte Shoptexte einsehen/bearbeiten
- `POST /products/{id}/listing/regenerate` — Shoptext-Job erneut anstoßen
- `GET /products/{id}/preview` — Shop-Vorschau (gerendertes Angebot)
- `POST /products/{id}/publish` — „JETZT VERÖFFENTLICHEN“ (prüft Qualität, legt `shop_publications`-Eintrag an, Job `publish_product`)
- `POST /shop/webhooks/{connection_id}/order` — Bestell-Webhook → Bestandsabbuchung mit Movement `sale`

## Dashboard & System

- `GET /dashboard` — Artikel heute/gesamt, zu prüfen, shopbereit, veröffentlicht
- `GET /jobs` (Admin) — Job-/Fehlerübersicht, `POST /jobs/{id}/retry`
- `GET /audit-log` (Admin/Lagerleiter, filterbar)
- `GET /health` — Liveness/Readiness

## Konventionen

- Fehlerformat: `{"detail": str, "code": str, "field_errors": {…}}`
- Pagination: `?limit=&offset=`, Antwort `{items, total, limit, offset}`
- Alle Zeiten UTC ISO-8601; Geldbeträge als String (`"28.50"`) zur Vermeidung von Float-Verlust
- Schreibende Endpoints akzeptieren `Idempotency-Key` (für Offline-Replays)
- Rate Limiting auf `/auth/*` und Upload-Endpoints (Token-Bucket, konfigurierbar)
