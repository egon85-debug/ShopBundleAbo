# Winterfeldt Logistik – Premium E-Commerce Shop

Produktionsnahe E-Commerce-Plattform: ruhige, helle Storefront, Warenkorb und
Checkout, Stripe-Zahlungen, automatisierte DHL-/DHL-Express-Versandabwicklung und
ein Backoffice, in dem Produkte, Kategorien und Bestellungen ohne
Programmierkenntnisse verwaltet werden.

```
Frontend (Next.js App Router)
   │
   ├─ Server Actions / Route Handlers ──► Services ──► PostgreSQL (Drizzle ORM)
   │                                         │
   │                                         ├─► Payment Service  (Stripe)
   │                                         ├─► Shipping Service (DHL Paket / DHL Express)
   │                                         └─► Mail Service     (SMTP)
```

## Schnellstart

```bash
cd shop
npm install
cp .env.example .env          # Secrets und Zugangsdaten eintragen
npm run db:migrate            # Schema anlegen (PostgreSQL)
npm run db:seed -- --admin-email admin@ihre-domain.de --admin-password "…"
npm run dev                   # http://localhost:3000
```

Backoffice: `http://localhost:3000/admin`

### Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Entwicklung, Produktions-Build, Start |
| `npm run typecheck` | TypeScript prüfen |
| `npm test` | Unit-Tests (Vitest) |
| `npm run db:generate` | Migration aus dem Schema erzeugen |
| `npm run db:migrate` | Migrationen anwenden |
| `npm run db:seed` | Adminbenutzer + Beispielkatalog anlegen |

## Welche Zugangsdaten hinterlegt werden müssen

Alle Werte gehören in `shop/.env` (Vorlage: `.env.example`) und **niemals in den
Client-Code**. Fehlt etwas, benennt das Dashboard es konkret; betroffene
Funktionen melden einen klaren Hinweis statt still zu scheitern.

| Variable | Pflicht | Wofür | Woher |
|---|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL | eigene Datenbank |
| `SESSION_SECRET` | ja | Sitzungen | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | für Zahlungen | Checkout, Erstattungen | Stripe Dashboard → API-Keys |
| `STRIPE_WEBHOOK_SECRET` | für Zahlungen | Webhook-Signaturprüfung | Stripe Dashboard → Webhooks |
| `DHL_PAKET_API_KEY`, `DHL_PAKET_USER`, `DHL_PAKET_PASSWORD`, `DHL_PAKET_BILLING_NUMBER` | für DHL Paket | Versandetiketten | developer.dhl.com → Parcel DE Shipping v2 + Geschäftskundenportal |
| `DHL_EXPRESS_API_KEY`, `DHL_EXPRESS_API_SECRET`, `DHL_EXPRESS_ACCOUNT_NUMBER` | für DHL Express | Express-Etiketten | developer.dhl.com → MyDHL API |
| `SHIP_FROM_*` | für Versand | Absenderadresse auf dem Etikett | eigene Daten |
| `SMTP_*` | für E-Mails | Bestell-, Zahlungs-, Versandbestätigungen | eigener Mailserver/Provider |

Stripe-Webhook lokal testen:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/app/(shop)/` | Storefront: Landingpage, Katalog, Produktseiten, Warenkorb, Checkout, Konto, Rechtsseiten |
| `src/app/admin/` | Backoffice: Dashboard, Bestellungen, Produkte, Kategorien |
| `src/app/api/` | Checkout, Stripe-Webhook, Etikett-PDF-Auslieferung |
| `src/app/actions/` | Server Actions (Warenkorb, Konto, Adminaktionen) |
| `src/services/` | Fachlogik: Katalog, Warenkorb, Bestellungen, Auswertungen |
| `src/lib/shipping/` | Shipping-Provider-Interface + DHL Paket + DHL Express |
| `src/lib/email/` | Transaktionale E-Mail-Vorlagen und Versand |
| `src/components/ui/` | Bausteine der Storefront (Kopf-/Fußzeile, Produktkarte, `Gestaltung.tsx`) |
| `src/db/` | Drizzle-Schema, Migrationen, Seed |

## Grundsätze im Code

- **Geldbeträge** sind durchgängig Integer in Cent – nie Float.
- **Beträge werden serverseitig berechnet**; Preise aus dem Client werden nie übernommen.
- **Bezahlt wird eine Bestellung nur über den signaturgeprüften Stripe-Webhook**,
  jedes Event wird über `webhook_events` genau einmal verarbeitet.
- **Bestellpositionen speichern einen Snapshot** von Name, SKU und Preis; spätere
  Produktänderungen verändern alte Bestellungen nicht.
- **Bestand** wird beim Bestellen reserviert und erst bei bestätigter Zahlung abgebucht.
- **Adminaktionen** (Status, Erstattung, Etikett, Produkt-/Kategorieänderung) landen im Audit-Log.
- **Versanddienstleister** sind über ein einheitliches Interface austauschbar.
- **Gestaltung** folgt `.claude/skills/winterfeld-design/SKILL.md` (Farben, Schrift,
  Abstände, Radien als Tailwind-Tokens in `tailwind.config.ts`).

## Deployment auf Vercel

Das Projekt ist für Vercel vorbereitet (Root-Verzeichnis: `shop`). Ablauf:

1. Vercel-Projekt mit dem GitHub-Repository verknüpfen, Root Directory `shop`,
   Production Branch `main`. Der Build läuft auch **ohne** gesetzte
   Umgebungsvariablen durch (die Datenbankverbindung ist lazy).
2. Unter *Settings → Environment Variables* mindestens setzen:
   - `DATABASE_URL` – Supabase-Transaction-Pooler-URL (Port 6543). Pooler werden
     automatisch erkannt; vorbereitete Anweisungen werden abgeschaltet.
   - `SESSION_SECRET` – `openssl rand -hex 32`
   - `NEXT_PUBLIC_SITE_URL` – die öffentliche URL des Deployments (für
     Stripe-Redirects und E-Mail-Links)
3. Redeploy auslösen. Stripe/DHL/SMTP-Zugangsdaten können jederzeit ergänzt
   werden; bis dahin melden die betroffenen Funktionen einen klaren Hinweis.

Supabase-Hinweis: Die Anwendung verbindet sich mit einer dedizierten Rolle
(`shop_app`) direkt per Postgres. Auf allen Tabellen ist RLS aktiv und die
öffentliche PostgREST-API (anon/authenticated) hat weder Grants noch Policies –
Shop-Daten sind ausschließlich über die Anwendung erreichbar.

## Rechtliches

Die Seiten Impressum, Datenschutz, AGB und Widerruf enthalten **ausdrücklich
gekennzeichnete Platzhalter**. Sie sind keine Rechtsberatung und müssen vor dem
Livegang durch die tatsächlichen Unternehmensdaten ersetzt und rechtlich geprüft
werden.

## Vor dem Deployment: gegen eine gefüllte Datenbank bauen

`next build` **ohne** `DATABASE_URL` ist kein verlässliches Signal. Alle
Datenzugriffe auf der Startseite sind abgesichert und liefern dann leere
Listen — es wird also keine einzige Produktkarte gerendert. Zwei Fehler sind
genau dadurch bis in die Produktion gekommen:

1. Prerendering der Produktseiten scheiterte, sobald `generateStaticParams`
   echte Slugs lieferte (behoben: es wird nicht mehr vorgerendert).
2. Eine Funktion wurde als Eigenschaft an eine Client-Komponente gereicht —
   das fällt erst auf, wenn die Karte tatsächlich gerendert wird.

Deshalb vor jedem Deployment einmal gegen echte Daten bauen:

```bash
# PostgreSQL starten (lokal oder im Container), dann:
export DATABASE_URL="postgres://…"
psql "$DATABASE_URL" -f drizzle/0000_initiales_schema.sql
npm run db:seed
rm -rf .next && NODE_ENV=production npm run build
```

Der Build muss mit Rückgabewert 0 enden **und** mindestens ein Produkt auf der
Startseite gerendert haben:

```bash
grep -c "data-produktkarte" .next/server/app/index.html   # > 0
```

## Gestaltung: ansehen, nicht nur bauen

Ein grüner Build sagt nichts über das Aussehen. Nach jeder Änderung an
der Oberfläche:

```bash
npm install --no-save playwright     # einmalig je Umgebung
npm start &                          # Shop läuft auf :3000
node shot.mjs                        # Aufnahmen nach ./aufnahmen
```

Dann die Bilder tatsächlich ansehen – Desktop und Handy. Die Prüfliste steht in
`.claude/skills/winterfeld-design/SKILL.md`.
