# Datenbankschema (PostgreSQL)

Alle Tabellen haben `id` (UUID, PK), `created_at`, `updated_at` (`timestamptz`,
serverseitig gesetzt). Geldbeträge sind `NUMERIC(12,2)` — niemals Float.
Die verbindliche Definition liegt in `backend/app/models/` und den Alembic-Migrationen
(`backend/migrations/versions/`).

## Kerntabellen

### users
| Spalte | Typ | Bemerkung |
|---|---|---|
| email | citext/varchar unique | Login |
| password_hash | varchar | PBKDF2-SHA256 |
| display_name | varchar | |
| role | enum `employee, warehouse_manager, shop_manager, admin` | rollenbasierte Rechte |
| is_active | bool | Deaktivieren statt Löschen |

### refresh_tokens
Rotierende Refresh-Tokens: `user_id FK`, `token_hash unique`, `expires_at`, `revoked_at`.

### suppliers
`name (unique, trigram-indexiert)`, `contact_person`, `phone`, `email`, `address`,
`customer_number`, `payment_terms`, `notes`. Sprach-Zuordnung: Fuzzy-Match auf `name`.

### storage_locations
Hierarchie über Selbstreferenz: `parent_id FK`, `kind` enum
(`site, hall, area, shelf, level, bin`), `name`, `code` (z. B. `H2/A/B4/E3`, unique),
`qr_code_value` (optional, für spätere QR-Scans).

### products
| Spalte | Typ |
|---|---|
| internal_sku | varchar unique (Format `WL-000245`, per Sequenz) |
| ean / gtin / upc / mpn | varchar, indexiert (Dubletten!) |
| manufacturer, brand, product_name, model | varchar |
| short_description, long_description | text |
| category, subcategory | varchar |
| attributes | JSONB (Farbe, Größe, Variante, Material, …) |
| technical_data | JSONB |
| condition | enum `new, new_opened, refurbished, used, defective, unknown` |
| packaging_condition | varchar |
| purchase_price_net / purchase_price_gross | NUMERIC(12,2) |
| sale_price / recommended_sale_price / minimum_sale_price | NUMERIC(12,2) |
| lowest/highest/average/median_market_price | NUMERIC(12,2) |
| price_research_date | timestamptz |
| stock_quantity / reserved_quantity | int ≥ 0 (available = stock − reserved, generiert) |
| supplier_id | FK suppliers |
| purchase_date, invoice_number | |
| storage_location_id | FK storage_locations |
| notes, voice_transcript | text |
| field_confidence | JSONB `{feld: 0.0–1.0}` |
| field_sources | JSONB `{feld: "user"|"research"|"ai"}` — Benutzerangaben haben Vorrang |
| processing_status | enum (s. architecture.md) |
| publication_status | enum `draft, ready, publishing, published, publish_failed` |
| created_by | FK users |

Indizes: `ean`, `mpn`, `internal_sku`, `(manufacturer, model)`, Trigram auf `product_name`.

### product_images
`product_id FK`, `kind` enum (`original, optimized`), `role` enum
(`front, back, packaging, barcode, type_plate, serial_number, accessories, damage, other`),
`storage_key` (Objekt-Storage-Pfad), `content_type`, `width`, `height`, `sort_order`,
`source_image_id FK` (optimiertes Bild → Original), `is_primary`. Originale werden nie
überschrieben oder gelöscht, solange das Produkt existiert.

### price_sources & price_quotes (Preisquellen + Einzelangebote)
`price_sources`: Name, Basis-URL, aktiv. `price_quotes`: `product_id`, `research_id`,
`source_id`, `price`, `shipping_cost`, `condition`, `url`, `title`, `is_comparable` (bool —
Varianten/Gebinde/Zustand aussortiert), `is_outlier` (bool), `fetched_at`.

### price_research_runs (Preis-Historie, Anforderung 27)
Ein Eintrag je Recherche-Lauf: `product_id`, `lowest`, `highest`, `average`, `median`,
`offer_count`, `comparable_count`, `researched_at`. UI zeigt daraus den Preisverlauf.

### stock_movements (Anforderung 17/32 — keine Bestandsänderung ohne Historie)
`product_id`, `movement_type` enum (`inbound, sale, manual_correction, return,
damaged, reserved, released, inventory_correction`), `quantity_change` (±int),
`quantity_before`, `quantity_after`, `reason`, `reference` (z. B. Shop-Order),
`user_id`, `created_at`. Bestand wird ausschließlich über `StockService.apply_movement()`
geändert (Transaktion: Movement + Produkt-Update + Audit).

### shop_connections & shop_publications
`shop_connections`: `name`, `connector_type` (`woocommerce`, …), `base_url`,
`credentials_encrypted` (Fernet-verschlüsselt, Schlüssel in Env), `is_active`.
`shop_publications`: `product_id`, `connection_id`, `external_id`, `status`
(`pending, published, failed, delisted`), `payload_snapshot` JSONB, `error`,
`published_at` — jede Veröffentlichung ist nachvollziehbar protokolliert.

### shop_listings (generierte Shoptexte)
`product_id`, `seo_title`, `short_description`, `long_description`, `bullet_points` JSONB,
`scope_of_delivery`, `condition_note`, `meta_title`, `meta_description`, `url_slug`,
`tags` JSONB, `suggested_price`, `generated_at`, `approved_by/at`.

### ai_runs (KI-Verarbeitung)
`product_id`, `kind` (`vision, ocr, stt, extraction, shoptext, image_optimize,
product_research`), `provider`, `model`, `input_ref`, `raw_output` JSONB,
`validated_output` JSONB, `confidence` JSONB, `status`, `error`, `duration_ms`.
KI-Rohdaten bleiben getrennt von den Fachdaten.

### audit_log (Anforderung 32)
`user_id`, `entity_type`, `entity_id`, `action` (`create, update, delete, publish,
stock_change, login, …`), `field`, `old_value`, `new_value`, `reason`, `created_at`.
Append-only (kein UPDATE/DELETE durch die Anwendung).

### jobs (Background-Queue)
`job_type`, `payload` JSONB, `status` (`queued, running, done, failed, dead`),
`attempts`, `max_attempts`, `run_at`, `locked_at`, `locked_by`, `last_error`,
`product_id` (optional, für Statusanzeige). Index auf `(status, run_at)`.

### voice_recordings
`product_id`, `storage_key`, `transcript`, `status`, `retention_until`
(DSGVO: Audio wird nach erfolgreicher Transkription gemäß Admin-Konfiguration gelöscht,
Standard: sofort nach Verarbeitung; Transkript bleibt Teil des Produktdatensatzes).

## Constraints (Auswahl)

- `stock_quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= stock_quantity`
- `price >= 0` auf allen Preisspalten
- `ean` Prüfziffer wird serverseitig validiert (Service-Ebene, GTIN-8/12/13/14)
- FK `ON DELETE RESTRICT` für Stammdaten (Supplier, Location), `CASCADE` nur für
  reine Kind-Daten (Bilder, Quotes, Listings) — Audit-Log referenziert per Wert, nicht FK.
