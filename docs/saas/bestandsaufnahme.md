# Bestandsaufnahme: Was heute nur für einen Händler funktioniert

Stand: 28.09.2026, Branch `claude/amazing-rubin-xjt83f`, Grundlage ist der Code auf `main`
(letzter Merge: Pull Request #21).

Die Liste ist nach Bereichen geordnet. Zu jedem Punkt steht, **wo** die Stelle liegt,
**warum** sie für mehrere Händler nicht reicht und **was** im Plan daraus wird
(Verweis auf `plan.md`).

## 1. Datenbank und Datenmodell

| # | Stelle | Problem bei mehreren Händlern | Plan |
|---|---|---|---|
| D1 | Zwei getrennte Datenbanken: Lager (`backend/app/models/`, Alembic) und Shop (`shop/src/db/schema.ts`, Drizzle, heute Supabase) | Zwei Systeme, zwei Sicherungen, zwei Zugänge | Eine PostgreSQL mit Schemata `plattform`, `lager`, `shop` (§ 3.2) |
| D2 | Keine Tabelle hat eine Mandanten-Spalte | Daten aller Händler lägen durcheinander | `tenant_id` in jeder fachlichen Tabelle + Row Level Security (§ 4) |
| D3 | Weltweit eindeutige Spalten im Lager: `users.email`, `products.internal_sku`, `products.client_capture_id`, `suppliers.name`, `storage_locations.code`, `storage_locations.qr_code_value`, `shop_connections.name`, `price_sources.name`, `idempotency_keys.key` | Händler B könnte keinen Lieferanten „Müller“ anlegen, wenn A ihn schon hat; SKU-Nummern kollidieren | Eindeutigkeit je Mandant: `UNIQUE (tenant_id, …)` |
| D4 | Weltweit eindeutige Spalten im Shop: `admin_users.email`, `customers.email`, `categories.slug`, `products.sku`, `products.slug`, `product_variants.sku`, `orders.order_number`, `newsletter_subscribers.email` | Zwei Shops könnten nicht beide eine Kategorie `/shop/werkzeug` haben; ein Endkunde könnte nicht in zwei Shops ein Konto anlegen | Eindeutigkeit je Mandant |
| D5 | Zähler `counters` (SKU `WL-000245`, `backend/app/services/product_service.py:34`) mit festem Präfix „WL“ | Präfix und Zählerstand gelten für alle | Zähler je Mandant, Präfix in den Firmeneinstellungen |
| D6 | Job-Warteschlange `jobs` holt einfach den ältesten Auftrag (`backend/app/jobs/queue.py`, `claim_next` sortiert nach `run_at`) | Ein Händler mit 2.000 Fotos blockiert alle anderen (Fehler 7 der Vorgaben) | Reihum je Mandant + Obergrenze gleichzeitiger Aufträge je Mandant (§ 4.6) |
| D7 | KI-Verbrauch in `ai_runs` nur je Artikel begrenzt (`KI_BUDGET_JE_ARTIKEL_USD`) | Keine Monatsgrenze, kein Kontingent (Fehler 8) | Kontingent + Budget je Artikel + Monatsgrenze je Mandant (§ 8) |

## 2. Geheimnisse und Einstellungen in Umgebungsvariablen

Heute gilt jede dieser Variablen für **den einen** Händler. In der Plattform gehören sie
entweder zum Betreiber (bleiben in der Server-Umgebung) oder zum Händler (wandern
verschlüsselt in die Datenbank).

| Variable (Datei) | Gehört künftig zu | Plan |
|---|---|---|
| `ANTHROPIC_API_KEY`, `STT_API_KEY`, `PRICE_RESEARCH_API_KEY` (`backend/.env.example`) | Plattform | bleibt Server-Umgebung |
| `KI_BUDGET_JE_ARTIKEL_USD` | Händler (mit Plattform-Obergrenze) | Einstellung je Mandant |
| `S3_*`, `STORAGE_BACKEND`, `MEDIA_PUBLIC_BASE_URL`, `DOMAIN` | Plattform | Hetzner Object Storage, Pfade je Mandant |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`shop/.env.example`) | heute Händler | Plattform-Schlüssel + Stripe Connect: Händler verbindet per Klick, tippt nichts ab |
| `DHL_PAKET_USER`, `DHL_PAKET_PASSWORD`, `DHL_PAKET_BILLING_NUMBER`, `DHL_EXPRESS_*_SECRET`, `DHL_EXPRESS_ACCOUNT_NUMBER` | Händler | verschlüsselt in der Datenbank (`CREDENTIALS_KEY`) |
| `DHL_PAKET_API_KEY`, `DHL_EXPRESS_API_KEY` | Plattform (App-Schlüssel im DHL-Entwicklerportal) | bleibt Server-Umgebung |
| `SHIP_FROM_*` (Absenderadresse) | Händler | Firmendaten im Setup |
| `SMTP_*`, `SMTP_FROM` | heute Händler | zentraler EU-Mail-Dienst, Absender je Händler-Domain |
| `INGEST_API_KEY`, `LAGER_WEBHOOK_URL`, `LAGER_WEBHOOK_SECRET` | heute Kopplung zweier Einzelsysteme | wird plattform-intern (§ 3.4) |
| `DEFAULT_TAX_RATE` | Händler | Steuer-Schritt im Setup |
| `NEXT_PUBLIC_SITE_URL` | Händler (Domain) | wird aus dem Host der Anfrage ermittelt |
| `UPLOADS_DIR` (Shop-Bilder lokal unter `public/uploads`) | Plattform | Object Storage |
| `GITHUB_TOKEN` (APK-Download vom eigenen Server, `backend/app/services/app_download.py`) | entfällt | App kommt aus dem Play Store |
| `JWT_SECRET`, `SESSION_SECRET`, `CREDENTIALS_KEY` | Plattform | bleiben; Sitzungen tragen die Mandanten-Kennung |

## 3. Fest eingebaute Firmendaten, Logo und Design

| Stelle | Inhalt |
|---|---|
| `shop/src/app/layout.tsx:16–28` | Seitentitel, Beschreibung, `siteName` „Winterfeld Logistik“ |
| `shop/src/components/ui/SiteChrome.tsx:17–139` | Logo `/marke/winterfeld-logistik.svg`, Copyright-Zeile |
| `shop/src/components/ui/EinstiegsVideo.tsx` | Einstiegsvideo und Logo (Kartons, eigene Datei unter `public/einstieg/`) |
| `shop/src/app/(shop)/produkt/[slug]/page.tsx:68` | JSON-LD `brand: "Winterfeld Logistik"` für **jedes** Produkt (auch fachlich falsch: Marke ist der Hersteller) |
| `shop/src/app/(shop)/shop/page.tsx:8`, `versand/page.tsx:9` | Beschreibungstexte mit Firmennamen |
| `shop/src/app/admin/layout.tsx:67`, `admin/login/page.tsx:12` | Schriftzug „WINTERFELD“ im Shop-Admin |
| `shop/src/app/global-error.tsx:31` | Firmenname auf der Fehlerseite |
| `shop/src/lib/email/templates.ts:42–166` | Kopf, Fuß und Betreffzeilen aller Mails |
| `shop/src/lib/stripe.ts:24` | `appInfo.name` |
| `shop/tailwind.config.ts`, `shop/src/app/globals.css` | Farben (Orange `#ff6105` …), Radien, Schatten als feste Werte, Schrift Inter |
| `shop/public/marke/*`, `shop/src/app/icon.svg` | Logo, Zeichen, Favicon |
| `backend/admin/index.html:6–24` | Titel und Schriftzug des Lager-Webs |
| `android/…/ServerUrl.kt:39`, `strings.xml`, `ui/theme/Theme.kt`, Launcher-Symbole | Name, Farben und Symbol der App |

## 4. Rechtstexte

`shop/src/app/(shop)/impressum|datenschutz|agb|widerruf|cookies|versand|zahlung/page.tsx`
enthalten Vorlagen mit Platzhaltern (`<Placeholder>`). Für die Plattform werden diese
Seiten durch Texte des Rechtstexte-Dienstes ersetzt; eigene Formulierungen erfindet die
Plattform nicht (§ 5, Schritt 9).

## 5. Verbindung Lager ↔ Shop

- `backend/app/connectors/winterfeld.py` + `shop/src/app/api/ingest/produkt/route.ts`:
  ein Schlüssel, eine Shop-Adresse.
- `shop/src/lib/lager-meldung.ts`: eine Webhook-Adresse, ein Geheimnis.
- `backend/app/cli.py shop-verbinden`: gibt Werte aus, die man **von Hand in Vercel**
  einträgt — für viele Händler nicht machbar.

## 6. Bilder

- `backend/app/api/admin.py:165` liefert **jede** Datei aus dem Speicher öffentlich aus,
  wenn man den Schlüssel kennt (Schutz nur durch unratbare UUIDs). Das gilt auch für
  Originalfotos und Sprachaufnahmen. Für mehrere Händler ist das zu schwach: Originale
  und Aufnahmen müssen privat sein, öffentlich nur freigegebene Shopbilder — und nur
  unter der Adresse des eigenen Shops (§ 4.5).
- Shop lädt Bilder vom Lager-Server (`MEDIA_PUBLIC_BASE_URL`) oder aus `public/uploads`.

## 7. Benutzer und Anmeldung

- Zwei getrennte Benutzertabellen: `users` (Lager, Rollen `employee`,
  `warehouse_manager`, `shop_manager`, `admin`) und `admin_users` (Shop-Admin) —
  Fehler 21 der Vorgaben.
- Keine Zwei-Faktor-Anmeldung.
- Passwort-Reset gibt es in beiden Teilen, aber getrennt.

## 8. Android-App

- Server-Adresse wird von Hand eingetippt (`LoginScreen.kt`, `ServerUrl.kt`).
- Paketname `de.winterfeld.logistik`, Name/Farben/Symbol fest.
- Die Tablets laufen mit einem **Debug-signierten** APK (`android/app/build.gradle.kts:47`,
  `debug.keystore` im Repository, Download über `/app`). Eine Play-Store-App trägt eine
  andere Signatur. Folge: Die neue App kann die alte **nicht** überschreiben und kommt
  nicht an deren lokale Offline-Warteschlange. Der Umstieg braucht deshalb einen
  eigenen Ablauf (§ 10.3), sonst gehen ungesendete Aufnahmen verloren.
- `targetSdk = 35`. Seit 31.08.2026 verlangt Google Play für neue Apps und Updates
  **API-Level 36** (Quelle: developer.android.com/google/play/requirements/target-sdk,
  abgerufen 28.09.2026).

## 9. Betrieb

- Backend: Docker Compose auf einem Hetzner-Server, Caddy mit **einer** festen Domain
  (`backend/Caddyfile`), Fly.io- und Cloudflare-Tunnel-Varianten.
- Shop: Vercel (serverlos), Datenbank Supabase.
- Sicherung: im Konzept beschrieben (`docs/security.md`), aber keine automatisierte
  Test-Wiederherstellung im Repository.
- Keine Staging-Umgebung, kein Infrastruktur-Code.

## 10. SEO

Vorhanden: Meta-Titel/-Beschreibung je Produkt und Kategorie, Open-Graph am Produkt,
JSON-LD `Product`, `noindex` für Konto-, Warenkorb-, Kassen- und Admin-Seiten.
Es fehlen: `sitemap.xml`, `robots.txt`, Canonical-Adressen, Open-Graph-Bilder für
Kategorien, `BreadcrumbList`/`Organization`, Versand- und Rückgabeangaben im `Offer`,
`noindex` für nicht live geschaltete Shops.
