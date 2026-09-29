# Plan: B.Y.O.B. — Winterfeld Logistik als Abo-Produkt

Stand: 29.09.2026 · Status: **angepasst nach Marktprüfung** (§ 0), Umsetzung Phase A läuft
(erledigt: Schritt 1 Mandantentrennung im Lager-Backend, Schritt 2 Bilder je Firma mit
signierten Adressen — siehe [`mandantentrennung.md`](mandantentrennung.md); Schritt 3
Server als Code — siehe [`infrastruktur.md`](infrastruktur.md))

**Was sich am 29.09.2026 geändert hat (Kurzfassung):**
1. Klare Zielgruppe: Händler mit vielen **Einzelstücken** statt „alle Onlineshops“ (§ 0).
2. Neues Kernversprechen: **einmal erfassen, überall verkaufen**. Marktplatz-Anbindung
   (zuerst eBay) mit Bestandsabgleich wird vorgezogen (§ 9a, Phase M).
3. Neue **Phase V (Validierung)** mit Pilotkunden und messbaren Kriterien, bevor der
   Setup-Assistent für Fremdkunden gebaut wird (§ 16).
4. Design-Baukasten startet mit **12 statt 100** geprüften Designs; der Ausbau auf 100 folgt
   bei Bedarf (§ 9).
5. Produktname **B.Y.O.B.** (Build your own Business), entwickelt von eg-dynamics.

Dazu gehören:
- [`bestandsaufnahme.md`](bestandsaufnahme.md) — alle Stellen, die heute nur für einen Händler funktionieren
- [`kostenmodell.md`](kostenmodell.md) — Fixkosten, Kosten je Kunde, Preisvorschlag, Quellen

Die Entscheidungen aus der Auftragsbeschreibung (zentrale Plattform, alles auf Hetzner,
Stripe Connect, eine Play-Store-App …) sind gesetzt und werden hier nicht erneut
abgewogen. Wo dieser Plan davon abweicht oder etwas ergänzt, steht es ausdrücklich mit
Begründung da. Die einzige inhaltliche Abweichung nach der Marktprüfung betrifft den
Umfang des Design-Baukastens zum Start (§ 9).

### Festlegungen (Stand 29.09.2026)

| Thema | Festlegung |
|---|---|
| Betreiber (Hersteller) | **eg-dynamics** |
| Produktname | **B.Y.O.B.** — „Build your own Business“ (Marken- und Domainprüfung offen, Aufgabe 8) |
| Produktdomain | vorerst **eg-dynamics.de**; eigene Produktdomain nach der Markenprüfung |
| App-Host (Setup, Lager-Web, Shop-Admin, Plattform-Admin) | `app.eg-dynamics.de` |
| Übergangs-Absender für Shop-Mails | `…@mail.eg-dynamics.de` (eigene Subdomain, damit die Firmen-Mails von eg-dynamics nicht unter Shop-Mails leiden) |
| Staging | `*.staging.eg-dynamics.de` |
| Preise und Rabattaktionen | siehe `kostenmodell.md` § 5–6 |
| Shopname und Domain der Händler | frei wählbar im Setup, mit Verfügbarkeitsprüfung (§ 7.7) |
| Sofort-Adresse der Shops | **offen**, siehe Frage unten |

**Offene Frage: Sofort-Adresse der Shops.** Möglich ist `<shop>.eg-dynamics.de`.
Empfehlung ist aber eine **zweite, eigene Domain nur für Händler-Shops**
(so machen es z. B. GitHub mit `github.io` oder Shopify mit `myshopify.com`).
Grund: Stellt ein Händler Unsinn oder Betrug online, können Browser-Warnlisten und
Spamfilter die ganze Domain treffen — dann litten auch `app.eg-dynamics.de` und die
Firmen-Mails. Die zweite Domain wird zusätzlich in die „Public Suffix List“ eingetragen,
damit Browser jeden Shop als eigene Website behandeln (getrennte Cookies). Die
Entscheidung muss vor dem ersten Fremdkunden fallen, weil ein späterer Wechsel die
Adressen aller Shops ändert.

---

## 0. Zielgruppe, Positionierung, Wettbewerb

### 0.1 Für wen

**Händler mit vielen Einzelstücken**, bei denen jeder Artikel einzeln erfasst, bewertet
und beschrieben werden muss:

- Second-Hand- und Gebrauchtwarenhändler,
- Haushaltsauflösungen und Entrümpelungen,
- Restposten- und Retourenverwerter,
- Antik-, Vintage- und Sammlerhandel,
- gewerbliche Marktplatz-Verkäufer mit wechselndem Sortiment.

**Nicht** die Zielgruppe: Händler mit wenigen Artikeln in großer Stückzahl (Mode-Label,
Dropshipping). Für sie ist ein allgemeiner Shop-Baukasten wie Shopify günstiger und besser.

### 0.2 Kernversprechen

> **Ein Foto – und dein Artikel ist erfasst, bewertet, beschrieben und überall im Verkauf.**

Der Wert liegt im **Ablauf für Einzelstücke**: Erfassen per App (Foto + Sprache) →
KI-Recherche mit Preisvorschlag → Shopbild und Text → Lagerplatz → gleichzeitig im eigenen
Shop **und** auf Marktplätzen → Verkauf an einer Stelle beendet das Angebot überall.

### 0.3 Wettbewerb (ehrlich)

| Anbieter | Was er kann | Was ihm für unsere Zielgruppe fehlt |
|---|---|---|
| eBay „Magical Listing“ | Foto → fertiges Angebot, kostenlos, auch für Privatverkäufer ([eBay, April 2025](https://innovation.ebayinc.com/stories/ebay-reduces-the-time-to-list-on-mobile-with-new-simplified-selling-tool-now-featuring-magical-listing-ai-technology/)) | nur eBay; kein Lager, keine Lagerplätze, kein eigener Shop |
| Shopify + Shopify Magic | Shop, KI-Texte und Bildfreistellung kostenlos in allen Tarifen ([Shopify Help Center](https://help.shopify.com/en/manual/ai-powered-tools/shopify-magic)) | kein Erfassungs-Ablauf für Einzelstücke, keine Preisrecherche, Lager und DHL nur über Zusatz-Apps |
| Warenwirtschaft (JTL, Xentral, Plentymarkets) | Lager und Mehrkanal-Verkauf | für kleine Händler komplex bzw. teuer; keine KI-Erfassung |

**Folgerung:** Die KI allein ist kein Alleinstellungsmerkmal mehr. Wir gewinnen nur mit der
**Kombination** aus Einzelstück-Erfassung, Lager und Verkauf auf mehreren Kanälen, und mit
Hosting in Deutschland.

### 0.4 Marktgröße (Schätzung, Stand 29.09.2026)

| | Zahl | Quelle / Grundlage |
|---|---|---|
| Onlinehandel Deutschland 2024 | 88,8 Mrd. € netto | [HDE Online-Monitor 2025](https://bvoh.de/hde-online-monitor-2025-onlinehandel-zurueck-auf-wachstumskurs/) |
| Onlineshops in Deutschland | ca. 190.700, davon ca. 70 % Kleingewerbe/Freiberuf | [Listflix, abgerufen 29.09.2026](https://listflix.de/statistik/online-shops/) |
| Davon mit vielen Einzelstücken | **Schätzung** 20.000–40.000, plus reine Marktplatz-Verkäufer | eigene Annahme, in Phase V zu prüfen |
| Realistisch erreichbar in 2–3 Jahren | **Schätzung** 300–1.000 zahlende Kunden ≈ 0,5–1,5 Mio. € Jahresumsatz | Mischpreis ~130 € (`kostenmodell.md` § 7) |

Erweiterung später: Österreich und Schweiz (gleiche Sprache).

## 1. Zielbild in einem Satz

Ein Hetzner-Projekt betreibt **einen** Code für alle Händler. Jede Anfrage kennt ihren
Händler (über die Domain des Shops oder über das Login). Die Datenbank selbst verweigert
den Zugriff auf fremde Daten, auch wenn im Code ein Fehler steckt.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Mandant** | ein Händler (Firma) mit seinen Daten, Nutzern, Domains, Einstellungen |
| **Plattform** | alles, was allen Mandanten gemeinsam ist; betrieben von dir |
| **Plattform-Admin** | du (und ggf. Support-Personen) |
| **Produktdomain** | deine Domain, z. B. `beispiel.de`; Shops erhalten `kunde.beispiel.de` |
| **App-Host** | `app.<produktdomain>`: Setup, Lager-Web, Shop-Admin, Plattform-Admin unter einer Adresse |

## 3. Architektur

### 3.1 Server (Hetzner, per Infrastruktur-Code)

```
                    Internet
                       │
          Floating IPv4 + IPv6 (fest, zeigt auf den aktiven Anwendungsserver)
                       │
┌──────────────────────┴─────────────────────────────────────────────┐
│ Anwendungsserver (Docker Compose)                                  │
│  Caddy ── On-Demand-TLS, `ask` → Plattform-API                     │
│   ├─ *.produktdomain / Kunden-Domains → Shop (Next.js, standalone) │
│   ├─ app.produktdomain /api, /lager  → Lager-API (FastAPI)         │
│   └─ app.produktdomain /*            → Next.js (Setup, Shop-Admin, │
│                                         Plattform-Admin)           │
│  Job-Worker (KI, Bilder, Mails, DNS-Prüfungen, Rechtstexte-Abruf)  │
└───────────────┬───────────────────────────────┬────────────────────┘
                │ privates Netz                  │ S3
┌───────────────┴────────────┐      ┌────────────┴─────────────────┐
│ Datenbankserver            │      │ Hetzner Object Storage       │
│ PostgreSQL 17              │─WAL─▶│  medien-<env>  (Bilder)      │
│ Schemata: plattform,       │      │  sicherung-<env> (pgBackRest)│
│ lager, shop · RLS aktiv    │      └──────────────────────────────┘
└────────────────────────────┘        + Storage Box (zweite Kopie)
```

- **Infrastruktur-Code**: **Terraform** (Hetzner-Provider) legt Server, Netz, Floating IP,
  Firewall, Buckets an; **Ansible** richtet die Server ein (Docker, PostgreSQL,
  pgBackRest, Benutzer, Updates); **Docker Compose** startet die Dienste. Warum beides:
  Terraform ist stark beim Anlegen von Ressourcen, Ansible beim Einrichten eines Servers.
- **Zwei Umgebungen**: `staging` und `produktion`, gleicher Code, gleiche Ansible-Rollen,
  nur kleinere Server auf Staging. Staging hat eigene Produktdomain-Unterdomain
  (`*.staging.<produktdomain>`), einen eigenen Stripe-**Testmodus** und ist komplett
  `noindex`.
- **Warum eine Floating IP**: Kunden-Domains ohne `www` zeigen per A-Eintrag auf diese
  Adresse. Wird der Server getauscht, wandert nur die Floating IP mit — kein Kunde muss
  seine DNS-Einträge ändern (Fehler 22).

### 3.2 Eine Datenbank, drei Schemata

| Schema | Inhalt | Wer schreibt |
|---|---|---|
| `plattform` | Mandanten, Pakete, Abos, Konten/Rollen, Domains, Setup-Stand, Designs, Kontingente, Audit, Plattform-Ereignisse | Plattform-API |
| `lager` | heutige Lager-Tabellen + `tenant_id` | Lager-API (Python/Alembic) |
| `shop` | heutige Shop-Tabellen + `tenant_id` | Shop (Next.js/Drizzle) |

Migrationen bleiben getrennt (Alembic für `plattform` und `lager`, Drizzle für `shop`),
laufen aber in **einer** Pipeline in fester Reihenfolge. Jede Migration muss
**rückwärtskompatibel** sein (Muster „erweitern → umstellen → aufräumen“ über zwei
Versionen), damit ein Update ohne Ausfall möglich ist.

### 3.3 Warum die Lager-API das Konto führt

Heute gibt es zwei Benutzertabellen. Künftig gibt es **eine** Kontotabelle in
`plattform`. Die Lager-API (FastAPI) übernimmt die Anmeldung, weil sie bereits
Refresh-Token-Rotation, Ratenbegrenzung und Passwort-Reset hat. Neu dazu: Zwei-Faktor
(TOTP-App, Wiederherstellungscodes).

**Abweichung vom heutigen Aufbau:** Der Shop-Admin zieht von `<shop>/admin` nach
`app.<produktdomain>/shop-admin`. Grund: Ein Anmelde-Cookie gilt nur für eine Domain.
Liegen Lager-Web, Shop-Admin, Setup und Plattform-Admin unter **einem** Host, reicht
**eine** Anmeldung für alles (Fehler 21). Die alte Adresse `/admin` im Shop leitet dorthin
weiter. Der Storefront selbst (Katalog, Warenkorb, Kundenkonten der Endkunden) bleibt auf
der Shop-Domain.

Rollen je Mandant: **Inhaber**, **Lagerleitung**, **Lager**, **Shop-Manager**
(entsprechen `admin`, `warehouse_manager`, `employee`, `shop_manager`). Eine Person kann
zu mehreren Mandanten gehören (Tabelle `mitgliedschaften`) und wählt beim Login.
Plattform-Admin ist ein eigenes Kennzeichen am Konto, **nie** eine Mandantenrolle.

Endkunden der Shops (Käufer) sind **keine** Plattformkonten; sie bleiben in `shop.customers`,
eindeutig je Mandant.

### 3.4 Lager ↔ Shop innerhalb der Plattform

Die Modulgrenze bleibt: **Lager führt Artikeldaten und Bestand, Shop verkauft.**
Die heutigen HTTP-Aufrufe über das Internet werden ersetzt durch eine
**Ereignistabelle** (`plattform.ereignisse`, „Outbox“-Muster):

1. Lager veröffentlicht einen Artikel → schreibt in derselben Transaktion ein Ereignis
   `produkt.veroeffentlicht` mit `tenant_id`.
2. Der Worker liefert es an den Shop-Übernahmecode (heute `services/ingest.ts`) — intern,
   ohne öffentliche Adresse, ohne `INGEST_API_KEY` je Händler.
3. Bezahlte Bestellung → Ereignis `bestellung.bezahlt` → Lager bucht Bestand als Movement
   `sale` (wie heute).

Vorteile: kein Geheimnis je Händler, keine verlorenen Meldungen (das Ereignis liegt in der
Datenbank, bis es verarbeitet ist), jede Meldung trägt ihren Mandanten.
**Übergang**: In Phase A bleibt der vorhandene HTTP-Weg intern erhalten (Docker-Netz,
Mandant im signierten Aufruf), damit Winterfeld in Phase B unverändert weiterläuft. Die
Umstellung auf Ereignisse folgt in Phase C.

Der WooCommerce-Connector bleibt für Kunden im Paket „Lager + App“, die einen **externen**
Shop betreiben. Marktplätze (zuerst eBay) hängen am selben Ereignisweg: Ein Verkauf auf
einem Kanal wird zu einer Bestandsbuchung im Lager und beendet die Angebote auf allen
anderen Kanälen (§ 9a).

### 3.5 Bilder

- Pfade im Bucket: `m/<tenant_id>/original/…`, `m/<tenant_id>/shop/…`, `m/<tenant_id>/marke/…`.
- **Originale und Sprachaufnahmen sind privat** (nur über die Lager-API mit Login
  bzw. kurzlebigen signierten Links).
- **Shopbilder** liefert der Shop unter seiner eigenen Domain aus
  (`https://<shop>/bilder/…`): Caddy/Next.js prüft, dass das Bild zum Mandanten dieser
  Domain gehört. Damit kann Shop A nie ein Bild von Shop B zeigen, auch nicht durch
  Raten eines Pfads.
- Bildgrößen (WebP/AVIF, mehrere Breiten) werden beim Veröffentlichen erzeugt, nicht bei
  jedem Aufruf.
- Originale werden nie überschrieben (wie heute).

## 4. Mandantentrennung

### 4.1 Drei Sicherungen hintereinander

1. **Code**: Jede Abfrage filtert nach `tenant_id` (zentral über eine Sitzungs-/
   Repository-Schicht, nicht in jeder Funktion von Hand).
2. **Datenbank (Row Level Security)**: Jede fachliche Tabelle hat
   `ENABLE` **und** `FORCE ROW LEVEL SECURITY` mit der Regel
   `tenant_id = current_setting('app.tenant_id')::uuid`. Die Anwendung verbindet sich mit
   einer Rolle **ohne** Eigentümer- und ohne `BYPASSRLS`-Recht und setzt am Anfang jeder
   Transaktion `SET LOCAL app.tenant_id = '…'`. Fehlt der Wert, sieht sie **nichts**.
3. **Tests**: siehe 4.4.

Plattform-Aufgaben, die über alle Mandanten laufen (Abrechnung, Kostenübersicht,
Worker-Verteilung), nutzen eine **eigene** Datenbankrolle, die nur die nötigen Tabellen
lesen darf und jeden Zugriff protokolliert.

### 4.2 Wie der Mandant ermittelt wird

| Weg | Quelle |
|---|---|
| Shop (Storefront) | Host der Anfrage → `plattform.domains` (Subdomain oder bestätigte eigene Domain). Unbekannter Host → 404 |
| Lager-API, App, Shop-Admin | Login-Token enthält `tenant_id` und Rolle; bei Mandantenwechsel neues Token |
| Worker | `tenant_id` steht im Auftrag; der Worker setzt ihn vor jeder Ausführung |
| Stripe-Webhooks | `event.account` (Connect) bzw. Kunden-ID (Billing) → Mandant |

### 4.3 Eindeutigkeit je Mandant

Alle heute global eindeutigen Spalten (Liste in `bestandsaufnahme.md`, D3/D4) werden zu
`UNIQUE (tenant_id, …)`. SKU-Zähler und Bestellnummern laufen je Mandant.

### 4.4 Trennungstests (Pflicht, laufen bei jedem Update)

Testaufbau: zwei Mandanten A und B mit **gleich benannten** Daten (gleiche SKU, gleiche
Kategorie, gleiche Kunden-E-Mail). Mit Konten und Domains von A wird versucht, an B zu
kommen über:

- jede API-Route (automatisch aus der OpenAPI-Beschreibung erzeugt, nicht von Hand gelistet),
- Shop-Seiten, Suche, Sitemap, Feeds,
- Bild-Adressen (eigene Domain + fremder Pfad),
- Exporte (CSV/ZIP),
- Jobs (Auftrag von A darf nichts in B schreiben),
- Webhooks (Ereignis mit fremder Konto-ID),
- direkte SQL-Abfrage ohne gesetzten Mandanten → muss **leer** sein.

Zusätzlich ein Test, der prüft, dass **jede** Tabelle mit `tenant_id` auch eine RLS-Regel
hat — eine neue Tabelle ohne Regel lässt die Pipeline scheitern.

### 4.5 Eigene Domains und Zertifikate

- Caddy stellt Zertifikate **nur** aus, wenn der `ask`-Endpunkt der Plattform-API
  „ja“ sagt: Domain gehört einem Mandanten **und** der DNS-Eintrag ist bestätigt
  (Quelle: caddyserver.com/docs/automatic-https#on-demand-tls). Das verhindert
  Missbrauch und schützt vor den Let's-Encrypt-Grenzen (Fehler 2).
- `www.kundendomain.de` → CNAME auf `shops.<produktdomain>`;
  `kundendomain.de` → A/AAAA auf die Floating IP. Eine Variante leitet per 301 auf die
  andere (Händler wählt; Vorschlag: auf `www`).
- Ist eine eigene Domain aktiv, leitet die Subdomain per 301 dorthin (eine Canonical-Adresse).

### 4.6 Faire Last und Grenzen

- **KI-Warteschlange reihum**: Der Worker nimmt nicht den ältesten Auftrag insgesamt,
  sondern den ältesten Auftrag des Mandanten, der am längsten nicht dran war; höchstens
  N gleichzeitige Aufträge je Mandant (Standard 2). Test: Mandant A stellt 1.000 Aufträge
  ein, Mandant B einen — B ist nach spätestens einem Durchlauf dran (Fehler 7).
- **Rate-Limits je Mandant** (API, Uploads, Login) zusätzlich zu den bestehenden je IP.
- **Obergrenzen je Paket**: Speicher, Artikelzahl, Nutzerzahl, Uploads je Minute.

### 4.7 Geheimnisse

- Plattform-Schlüssel (Anthropic, Stripe-Plattform, Mail-Dienst, DHL-App-Schlüssel,
  Google-OAuth) nur in der Server-Umgebung, auf dem Server mit **sops/age** verschlüsselt
  im Infrastruktur-Repository, nie im Klartext im Code, nie in der App.
- Händler-Geheimnisse (DHL-Zugang, Rechtstexte-Token, Google-Tokens) verschlüsselt in
  `plattform.zugangsdaten` mit dem vorhandenen `CREDENTIALS_KEY`; zusätzlich je Datensatz
  ein eigener Schlüssel (Umschlagverschlüsselung), damit der Hauptschlüssel später
  gewechselt werden kann — heute darf er sich laut `deployment-backend.md` nie ändern.

## 5. Datenmodell der Plattform (Auszug)

| Tabelle | Wichtige Felder |
|---|---|
| `mandanten` | id, name, kurzname (Subdomain), status (`test`, `aktiv`, `ueberfaellig`, `gesperrt`, `gekuendigt`, `geloescht`), paket, live_seit, gesperrt_ab, loeschen_ab |
| `firmendaten` | Rechtsform, Vertretung, Anschrift, Kontakt, USt-IdNr./Steuernummer, kleinunternehmer (bool), Versandabsender, Ladengeschäft (optional) |
| `konten` | E-Mail (global eindeutig), Passwort-Hash, 2FA-Geheimnis (verschlüsselt), ist_plattform_admin |
| `mitgliedschaften` | konto_id, tenant_id, rolle |
| `pakete` / `abos` | Paket, Zusatzpakete (SEO Plus), Stripe-Kunden-/Abo-ID, Testphase bis, Status |
| `kontingente` | tenant_id, monat, ki_artikel_inklusive, verbraucht, zusatz, monatsgrenze_eur, verhalten_ueber_kontingent (`aufpreis` / `anhalten`) |
| `setup_schritte` | tenant_id, schritt, status (`offen`, `in_arbeit`, `erledigt`, `uebersprungen`, `wartet_extern`), daten (JSON), geprüft_am, erledigt_von (Kunde / Plattform-Admin) |
| `domains` | tenant_id, name, art (`sub`, `eigen`), dns_status, tls_status, ist_primaer, bestätigt_am |
| `designs` | nummer (1–100), name, beschreibung, layout, farbwelt, schriften, tokens (JSON), geprüft (bool), vorschaubilder |
| `mandant_design` | tenant_id, design_nummer, eigene Markenfarbe, Logo-Varianten |
| `zugangsdaten` | tenant_id, anbieter (`dhl_paket`, `dhl_express`, `rechtstexte`, `google`), verschlüsselte Daten, zuletzt_geprüft, prüfergebnis |
| `stripe_konten` | tenant_id, account_id, Fähigkeiten-Status, Auszahlungen aktiv |
| `kanal_verbindungen` | tenant_id, kanal (`ebay`, `woocommerce` …), verschlüsselte Zugangs-Token, Status, zuletzt_geprüft (§ 9a) |
| `kanal_angebote` | tenant_id, product_id, kanal, externe_id, status (`entwurf`, `aktiv`, `beendet`, `fehler`), zuletzt_abgeglichen |
| `ereignisse` | Outbox (§ 3.4) |
| `webhook_eingang` | anbieter, event_id (eindeutig), tenant_id, verarbeitet_am |
| `audit` | wer, als_wer (bei „als Kunde ansehen“), mandant, aktion, vorher/nachher, Zeit — nur anhängen |
| `support_notizen`, `wartungshinweise`, `kosten_monat` | Plattform-Admin |

## 6. Stripe

### 6.1 Zahlungen der Shops (Stripe Connect) — Fehler 4

Stripe führt die alten Kontotypen „Standard/Express/Custom“ inzwischen als veraltet und
empfiehlt für **neue** Plattformen die **Accounts-v2-API**
(docs.stripe.com/connect/accounts-v2). Empfehlung:

| Einstellung | Wert | Wirkung |
|---|---|---|
| `dashboard` | `full` | Händler hat das volle Stripe-Dashboard, sieht Zahlungen, Erstattungen, Streitfälle selbst |
| `defaults.responsibilities.fees_collector` | `stripe` | Stripe zieht die Gebühren direkt beim Händler ein |
| `defaults.responsibilities.losses_collector` | `stripe` | **Stripe haftet für negative Salden des Händlers, nicht du** („Managed Risk“) |
| Abbuchungsart | **Direct Charges** | Zahlung läuft auf dem Konto des Händlers; er ist Verkäufer, trägt Erstattungen und Rückbuchungen |
| Onboarding | Stripe-gehostet | Händler klickt „Mit Stripe verbinden“, tippt keine Schlüssel ab |

Quellen: docs.stripe.com/connect/saas/tasks/create;
docs.stripe.com/connect/risk-management/connected-accounts-with-managed-risk
(„Managed Risk requires direct charges … recommended for SaaS platforms“), abgerufen
28.09.2026. Zu beachten: Stripe setzt bei Managed Risk bestimmte Anforderungen an
Onboarding und Kontodarstellung — vor dem Bau mit Stripe klären.

Die Plattform nimmt **keine** Transaktionsgebühr (keine `application_fee`); ihr Umsatz
kommt aus dem Abo. Das hält die Rolle als reiner Softwareanbieter klar.

### 6.2 Deine Abos (Stripe Billing)

- Pakete und SEO Plus als Produkte mit Monats- und Jahrespreis; Einrichtungsgebühr als
  einmaliger Posten in der ersten Rechnung; 14 Tage Testphase.
- KI-Artikel über dem Kontingent: **Stripe-Zähler (Meter)**; der Worker meldet jeden
  abrechenbaren Artikel mit Idempotenz-Schlüssel.
- **Rabattaktionen** über Stripe-Gutscheine und Aktionscodes, angelegt im Plattform-Admin
  (Prozent/Betrag, Dauer, Pakete, Ablaufdatum, Höchstzahl, nur Neukunden; Warnung bei
  Unterschreiten der Kostengrenze; Details `kostenmodell.md` § 6).
- Rechnungen, Karte und SEPA-Lastschrift über Stripe; Kundenportal von Stripe für
  Zahlungsdaten und Rechnungen.
- Mit Accounts v2 kann derselbe Stripe-Account des Händlers zugleich „Kunde“ deines Abos
  sein (Konfiguration `customer`). Ob das oder ein getrennter Kunde einfacher ist, entscheide
  ich beim Bau nach Prüfung der dann aktuellen API.

### 6.3 Webhooks

Zwei getrennte Endpunkte mit eigenen Signaturgeheimnissen:
`/webhooks/stripe/connect` (Ereignisse der Händlerkonten) und `/webhooks/stripe/billing`
(deine Abos). Jedes Ereignis wird über `webhook_eingang.event_id` **genau einmal**
verarbeitet und über die Konto-/Kunden-ID dem Mandanten zugeordnet. Unbekannte Konten
→ protokolliert, nicht verarbeitet.

### 6.4 Zahlungsverzug und Sperre (Fehler 18)

| Tag | Was passiert |
|---|---|
| 0 | Zahlung fehlgeschlagen; Stripe versucht automatisch erneut; Mail + Hinweis im Dashboard |
| 7 | zweite Erinnerung, Banner „Zahlung offen – Sperre am …“ |
| 14 | Status **gesperrt**: Lager nur lesen, Shop zeigt Wartungsseite (HTTP 503 + `noindex`), App nur lesen. **Nichts wird gelöscht.** |
| Sperre + Aufbewahrungsfrist | Export-Angebot per Mail, dann Löschung mit Protokoll |

Tage sind Vorschläge; die Aufbewahrungsfrist entscheidest du (Frage 7).

## 7. Setup-Assistent

### 7.1 Grundregeln der Umsetzung

- Jeder Schritt ist ein eigener Datensatz in `setup_schritte` mit **serverseitiger
  Prüfung**. „Weiter“ fragt den Server; erst wenn die Prüfung grün ist, wird der Schritt
  `erledigt`.
- Schritte mit externem Anbieter zeigen: Anleitung, Direktlink, „Verbindung testen“,
  Fehlermeldung in Alltagssprache, automatische Wiederholung bei DNS-/Stripe-Wartezeiten
  (`wartet_extern`, Prüfung alle paar Minuten im Worker, Mail wenn fertig).
- Plattform-Admin kann jeden Schritt ansehen und erledigen; im Audit steht, wer es war.
- Mobil bedienbar (Screenshots Handy + Desktop sind Teil der Abnahme).

### 7.2 Reihenfolge (angepasst)

Ich schlage vor, **Design vor Logo** zu legen und **Steuern direkt nach den Firmendaten**
zu fragen: Die Kleinunternehmerregelung bestimmt, was der Shop an Preisen anzeigt, und das
Design mit Live-Vorschau motiviert, bevor die zäheren Schritte (Stripe, DNS, Rechtstexte)
kommen. Die Pflicht-Schritte für den Livegang sind **fett**.

| # | Schritt | Pflicht | Prüfung auf dem Server |
|---|---|---|---|
| 1 | **Konto & Paket** | ja | E-Mail bestätigt, Stripe-Checkout abgeschlossen (Testphase aktiv) |
| 2 | **Firmendaten** | ja | Pflichtfelder, PLZ-Format je Land, USt-IdNr.-Format (und optional Abfrage beim EU-Dienst VIES), Absenderadresse |
| 3 | **Steuern & Preise** | ja | Steuersätze, Kleinunternehmer-Hinweis passt zu Schritt 2, Grundpreis/Pfand |
| 4 | **Design wählen** | ja | eines der geprüften Designs gewählt |
| 5 | Logo & Markenfarbe | nein (Platzhalter aus Firmennamen) | Format, Mindestauflösung, Kontrast hell/dunkel; erzeugt Favicon, App-Symbol |
| 6 | Domain | Subdomain automatisch; eigene Domain optional | Wunschname frei wählbar mit **Verfügbarkeitsprüfung** (§ 7.7); DNS-Prüfung, danach Zertifikat |
| 7 | **Zahlungen (Stripe Connect)** | ja | Konto kann Kartenzahlungen annehmen und auszahlen (laut Stripe-Status) |
| 8 | **Versand** | ja, wenn Versand genutzt | DHL-Zugang per **Prüfanfrage ohne Etikett** (`validateShipment` der Parcel-DE-Shipping-API v2, developer.dhl.com); Versandarten, Preise, Länder |
| 9 | **E-Mail-Absender** | ja (Testmail) | SPF/DKIM/DMARC geprüft *oder* Übergangsweise Plattform-Absender mit Antwortadresse; Testmail zugestellt |
| 10 | **Rechtstexte** | ja | alle vier Texte (Impressum, Datenschutz, AGB, Widerruf) vom Dienst vorhanden |
| 11 | Lager & Team | je Paket | Lagerplätze, Einladungen, QR-Code zur App |
| 11a | Marktplätze verbinden (neu) | nein, aber empfohlen | eBay-Konto per Anmeldung bei eBay verbunden; Probeangebot im Entwurf angelegt und wieder gelöscht (§ 9a) |
| 12 | KI | ja (Standard vorbelegt) | Budget je Artikel, Monatsgrenze, Verhalten über Kontingent |
| 13 | Sichtbarkeit bei Google | nein | Suchbegriffe; Search Console / Merchant Center optional |
| 14 | **Abschluss-Check & Livegang** | ja | Checkliste grün, Testbestellung erfolgreich |

### 7.3 Testbestellung ohne echte Kosten (Fehler 23)

Empfehlung — zweistufig:

1. **Ablauf-Test im Stripe-Testmodus**: Der Shop des Händlers läuft im Modus „Probe“:
   Warenkorb → Kasse → Zahlung mit Stripe-Testkarte → Bestellmail → Versandetikett nur
   als **DHL-Prüfanfrage** (kein Etikett) → Versandmail. Die Bestellung ist als
   `test` markiert, **bucht keinen Bestand**, erscheint nicht in Umsatzzahlen und wird
   danach gelöscht. Dafür braucht die Plattform ein Test-Pendant des verbundenen Kontos;
   das Anlegen erledigt der Assistent im Hintergrund.
2. **Live-Bereitschaft ohne Zahlung**: Das echte Stripe-Konto des Händlers wird über den
   Stripe-Status geprüft (Kartenzahlungen aktiv, Auszahlungen aktiv, keine offenen
   Anforderungen). Eine echte Zahlung ist dafür nicht nötig.

Optional kann der Händler zusätzlich eine echte Kleinstbestellung (1 €) mit sofortiger
Erstattung auslösen. Das kostet ihn die Stripe-Gebühr (ca. 0,27 €); deshalb ist es nur
ein Angebot, keine Pflicht.

### 7.4 E-Mail-Absender (Fehler 5 und 6)

- Zentraler EU-Mail-Dienst in deinem Konto, mit AVV. Kandidaten: **Lettermint** (NL)
  oder **Scaleway TEM** (FR); Entscheidung nach einem Test, ob sich viele Absender-Domains
  samt DKIM-Schlüssel **per API** anlegen und prüfen lassen (Frage 9).
- Bis die Händler-Domain bestätigt ist: Absender `shopname@mail.<produktdomain>`,
  Antwortadresse des Händlers. Danach Absender auf der Händler-Domain.
- Bounces und Beschwerden werden je Mandant gezählt; bei Häufung wird der Versand des
  Mandanten angehalten, damit nicht alle Shops in den Spam rutschen.

### 7.5 Rechtstexte (Fehler 16)

- Schnittstelle als austauschbarer Adapter (wie die Shop-Connectoren heute).
  **Händlerbund**: Händler erzeugt dort ein Token und trägt es im Assistenten ein; die
  Plattform holt die Texte regelmäßig ab. **IT-Recht Kanzlei**: überträgt die Texte über
  ihre „Datenschnittstelle 3.0“ an eine Empfangsadresse der Plattform; dafür muss die
  Plattform bei der Kanzlei als Schnittstelle angemeldet werden.
- Vor dem Bau: mit beiden Anbietern klären, ob eine Plattform-Anbindung (eine
  Schnittstelle für viele Händler) möglich ist und zu welchen Bedingungen.
- Der Assistent sagt klar: **Jeder Händler braucht ein eigenes Abo beim Anbieter.**
- Die Plattform erfindet und formuliert **keine** Rechtstexte. Ohne alle vier Texte kein
  Livegang.

### 7.6 DHL (Fehler 15)

Die Plattform braucht **eine** App im DHL-Entwicklerportal, deren produktive Nutzung DHL
freigeben muss. Das dauert erfahrungsgemäß; deshalb gleich zu Beginn beantragen
(Aufgabe für dich, Phase A). Jeder Händler bringt seinen eigenen Geschäftskundenzugang
(Benutzer, Passwort, Abrechnungsnummer) mit.

### 7.7 Shopname und Wunschdomain mit Verfügbarkeitsprüfung

Der Händler wählt **Shopname** und **Domain** im Setup frei.

- **Subdomain** (`<name>.<produktdomain>`): Die Prüfung läuft sofort gegen die eigene
  Datenbank, dazu eine Sperrliste (`www`, `app`, `admin`, `mail` …, geschützte Marken,
  anstößige Wörter).
- **Eigene Domain**: Der Assistent schlägt aus dem Shopnamen Varianten vor
  (`.de`, `.com`, `.shop`, mit/ohne Bindestrich) und zeigt je Variante
  „frei“, „vergeben“ oder „gehört schon dir“.
  - Grundlage ist die **Domain-Check-API eines Registrars** (Vorschlag: INWX, deutscher
    Registrar mit API und Wiederverkäufer-Programm). Eine freie Abfrage über RDAP reicht
    für `.de` nicht: DENIC betreibt RDAP nur im Versuchsbetrieb ohne Zusagen, und
    `.de` fehlt im offiziellen RDAP-Verzeichnis der IANA
    (denic.de/rdap-master, abgerufen 28.09.2026).
  - Anfragen werden gedrosselt und kurz zwischengespeichert, damit niemand die Prüfung als
    Massenabfrage missbraucht.
  - Das Ergebnis ist eine **Momentaufnahme**: Frei heißt nicht reserviert.
- **Stufe 1 (Phase C)**: prüfen und vorschlagen. Gekauft wird beim Registrar der Wahl des
  Händlers, danach folgt der DNS-Assistent.
- **Stufe 2 (Phase E, optional)**: „Domain über uns registrieren“. Inhaber wird der
  Händler, die Plattform setzt die DNS-Einträge selbst, der DNS-Assistent entfällt.
  Die Kosten laufen als Posten über Stripe Billing. Dazu kommen: Verlängerung,
  Umzug zu einem anderen Anbieter bei Kündigung (Auth-Code auf Knopfdruck) und das
  Wiederverkäufer-Verhältnis zum Registrar (vorher rechtlich prüfen).

## 8. KI-Kosten im Griff (Fehler 8)

Vor jedem KI-Schritt prüft der Worker in dieser Reihenfolge:

1. **Budget je Artikel** (heute schon: `KI_BUDGET_JE_ARTIKEL_USD`, Standard 0,35 $),
2. **Kontingent** des Monats (inklusive Artikel; darüber je nach Einstellung Aufpreis
   oder Stopp),
3. **Monatsgrenze je Mandant** in Euro (harte Obergrenze, auch bei „Aufpreis“),
4. **Plattform-Notbremse** (Tagesgrenze über alle Mandanten, Alarm per Mail).

Ein angehaltener Schritt verliert keine Daten; der Artikel bleibt erfasst und kann
später weiterverarbeitet werden (wie heute bei Budget-Überschreitung). Verbrauch und
Kosten stehen in `ai_runs` mit `tenant_id` und fließen in die Kostenübersicht.

Für SEO-Plus-Texte gilt ein eigenes Kontingent mit derselben Budgetbremse.

## 9. Design-Baukasten

**Abweichung (29.09.2026):** Zum Start **12 geprüfte Designs** aus **3 Grundlayouts**
statt 100 aus 10. Grund: Für Einzelstück-Händler entscheiden Erfassung und Marktplätze
über den Kauf, nicht die Zahl der Designs. Die Technik (Token-System, automatische
Prüfung) wird von Anfang an so gebaut, dass der Ausbau auf 100 Designs ohne Umbau möglich
ist; er folgt, wenn Pilotkunden danach fragen. Werbung und Videos sprechen bis dahin von
„eigenem Design“, nicht von „100 Designs“.

- **Ein Code, viele Token-Sätze** (Fehler 11). Tailwind-Farben, Radien, Schatten und
  Schriften werden auf CSS-Variablen umgestellt (`--farbe-akzent`, `--radius-karte` …);
  das Layout der Shop-Seite setzt die Variablen des Mandanten.
- **Grundlayouts** (zum Start 3, später bis 10) als Varianten derselben Komponenten
  (Kopfzeile, Einstieg, Produktkarte, Produktseite, Fußzeile, Warenkorb). Varianten ändern Anordnung und
  Aussehen, **nie** Funktionen; alle nutzen dieselben Server-Aktionen und Tests.
- **Farbwelten** und **Schriftpaare** (nur Google Fonts unter OFL, selbst ausgeliefert,
  kein Abruf bei Google zur Laufzeit — auch aus Datenschutzgründen).
- **Kuratierte Kombinationen** (zum Start 12, Ausbau bis 100) mit Nummer, Name,
  Beschreibung, Filtermerkmalen (hell/dunkel, ruhig/verspielt, Branche). Das heutige
  Winterfeld-Design ist Nr. 1.
- **Automatische Prüfung** (Playwright + axe-core) je Design, sonst nicht in der Galerie:
  Kontrast WCAG AA für Text und Knöpfe, Mindestschriftgröße am Handy, kein seitliches
  Scrollen bei 360 px, kompletter Checkout im Testmodus, Vorschaubilder Desktop/Handy.
- Die Regeln aus `winterfeld-design` (ein Akzent je Sichtbereich, flache Karten …) sind
  Prüfmaßstab für alle Designs.
- Keine Nachbildung fremder Marken; eigene Beispielbilder für die Vorschau.

## 9a. Marktplätze: einmal erfassen, überall verkaufen (neu)

Für Einzelstücke (Bestand fast immer 1) ist der **Doppelverkauf** das größte Risiko: Der
Artikel wird im Shop verkauft, steht aber noch bei eBay. Deshalb ist der Bestandsabgleich
Pflichtteil der Anbindung, nicht Zusatz.

| Kanal | Plan | Hinweis |
|---|---|---|
| Eigener B.Y.O.B.-Shop | vorhanden | über die Ereignistabelle (§ 3.4) |
| **eBay** | **zuerst (Phase M)** | offizielle Verkäufer-Schnittstellen von eBay; Händler verbindet sein eBay-Konto per Anmeldung bei eBay (OAuth), tippt keine Schlüssel ab. Vor dem Bau die dann aktuelle eBay-Entwicklerdoku und die Nutzungsbedingungen prüfen |
| Externe Shops (WooCommerce) | vorhanden | bestehender Connector |
| Kleinanzeigen, Vinted u. a. | geprüft, nicht zugesagt | nur, wenn es eine offizielle Schnittstelle gibt; kein Automatisieren über Web-Oberflächen |

**Ablauf:**
1. Artikel ist erfasst und freigegeben → Händler wählt die Kanäle (Standard je Firma
   einstellbar).
2. Der Worker legt das Angebot je Kanal an; Kategorie- und Pflichtfeld-Zuordnung schlägt
   die KI vor, der Händler bestätigt beim ersten Mal je Kategorie.
3. **Verkauf auf einem Kanal** → Lager bucht den Bestand → auf allen anderen Kanälen wird
   das Angebot sofort beendet bzw. auf 0 gesetzt.
4. Ein Abgleich im Hintergrund prüft regelmäßig, ob Bestand und Angebote übereinstimmen,
   und meldet Abweichungen im Lager-Web.

**Fertig, wenn:** Ein Artikel mit Bestand 1 steht gleichzeitig im Shop und bei eBay; ein
Testkauf auf einem Kanal beendet das Angebot auf dem anderen nachweislich innerhalb von
Minuten (Test in der eBay-Testumgebung, der „Sandbox“).

## 10. Migration von Kunde Nr. 1 (Winterfeld)

### 10.1 Ablauf

1. **Mandant „Winterfeld“** wird in Staging angelegt.
2. **Probelauf**: Kopie der Lager-DB (Hetzner) und der Shop-DB (Supabase) + aller Bilder
   (Volume des Lager-Servers bzw. `public/uploads`) → Staging. Ein Migrationsskript setzt
   `tenant_id`, schreibt Bildpfade um, führt die zwei Benutzertabellen zusammen (gleiche
   E-Mail = ein Konto mit beiden Rollen).
3. **Zahlenabgleich** (automatischer Bericht): Anzahl Artikel, Summe Bestand je Artikel,
   Bestellungen (Anzahl, Summen, Status), Kunden, Bilder (Anzahl + Prüfsummen), KI-Läufe
   und Kosten, Audit-Einträge, Bestandsbewegungen. Jede Abweichung ≠ 0 stoppt.
4. **Probelauf wiederholen**, bis der Bericht zweimal hintereinander sauber ist.
5. **Stripe**: Winterfeld verbindet sein bestehendes Stripe-Konto per Connect-Onboarding
   (das bestehende Konto kann weiterverwendet werden; Zahlungen laufen weiter auf
   Winterfeld). Die alten Webhook-Endpunkte werden erst nach dem Umzug abgeschaltet.
6. **Umschalten** mit angekündigter Wartung (Ziel: unter 30 Minuten, nachts):
   Shop auf Wartungsseite → letzte Änderungen kopieren → Abgleich → DNS umstellen →
   Stichproben → Shop live.
7. **Rückweg**: Die alten Systeme (Vercel, Supabase, alter Lager-Server) bleiben
   **14 Tage** unverändert und abrufbar. Geht beim Umschalten etwas schief, wird DNS
   zurückgestellt (niedrige TTL vorher setzen). Bestellungen, die in der Zwischenzeit auf
   der neuen Plattform eingingen, werden per Export in das alte System übernommen —
   dafür gibt es ein vorbereitetes Skript.

### 10.2 Winterfelds eigene Domain

Die heutige Shop-Adresse wird als eigene Domain des Mandanten eingetragen; Zertifikat
vor dem Umschalten per DNS vorbereitet, damit es keine Lücke gibt.

### 10.3 Tablets: keine Aufnahme darf verloren gehen

Die Play-Store-App trägt eine andere Signatur als das heutige APK und kann es nicht
überschreiben. Deshalb:

1. Letztes Update des alten APK: zeigt „Umstieg vorbereiten“, **sendet alle offenen
   Aufnahmen** und bestätigt erst, wenn die Warteschlange leer ist; neue Aufnahmen sind
   dann gesperrt.
2. Erst danach Play-Store-App installieren und anmelden; altes APK deinstallieren.
3. Das alte Backend nimmt bis zum Ende der Rückweg-Frist weiter Uploads an und leitet
   sie an die Plattform weiter, falls ein Gerät übersehen wurde.

## 11. SEO

**Grundlage für alle Shops** (Phase D): `sitemap.xml` und `robots.txt` je Host,
Canonical auf die Primärdomain, 301 bei geänderten Produkt-URLs (Tabelle
`shop.weiterleitungen`), `noindex` per `X-Robots-Tag` für Test-, gesperrte, Staging- und
Vorschau-Shops, strukturierte Daten (Product/Offer inkl. Versand und Rückgabe,
BreadcrumbList, Organization, LocalBusiness wenn Ladengeschäft), Open-Graph-Bilder je
Produkt und Kategorie, Alt-Texte (KI-Vorschlag, Händler bestätigt), SEO-Checkliste im
Shop-Admin mit Direktlinks.

Fachlicher Fehler im heutigen Code: JSON-LD nennt „Winterfeld Logistik“ als **Marke**
jedes Produkts. Richtig ist der Hersteller; der Händler gehört in `Offer.seller`.

**SEO Plus** (Phase E): KI-Optimierung einzigartig je Shop (Suchbegriffe, Region, eigener
Ton; eine Ähnlichkeitsprüfung verhindert, dass zwei Händler denselben Text erhalten —
Fehler 20), Search-Console-Anbindung per OAuth (Klicks, Impressionen, Suchbegriffe,
Fehler), Merchant-Center-Feed über die **Merchant API** (die alte Content API for Shopping
wurde am 18.08.2026 abgeschaltet; developers.google.com/shopping-content), Monatsbericht.

Regeln: keine Ranking-Versprechen, jeder KI-Text sichtbar und änderbar,
Händlerangaben vor KI-Vorschlag, keine Massenproduktion dünner Seiten.

## 12. Android-App

- Eine App im Play Store, neuer Paketname unter deiner Marke, Server-Adresse fest
  eingebaut (für Staging eine eigene Test-Variante).
- Login nur mit E-Mail und Passwort; bei mehreren Firmen Auswahl.
- Logo, Name, Akzentfarbe kommen nach dem Login vom Server.
- **targetSdk 36** (Pflicht seit 31.08.2026).
- Früh erledigen (Fehler 14): Entwicklerkonto **als Organisation** (D-U-N-S-Nummer), dann
  entfällt der 12-Tester-/14-Tage-Pflichttest für neue Privatkonten
  (support.google.com/googleplay/android-developer/answer/14151465); trotzdem
  interne/geschlossene Testphase mit Winterfeld-Tablets; Datenschutzerklärung der App;
  Formular „Datensicherheit“; Weg zur Kontolöschung in App **und** im Web; Release-
  Schlüssel über Play App Signing, nie im Repository.

## 13. Plattform-Admin

Wie in der Auftragsbeschreibung (Kundenliste, Details je Kunde, Aktionen, Betrieb,
Kostenübersicht). Ergänzend:
- „Als Kunde ansehen“ öffnet eine **eigene, zeitlich begrenzte** Sitzung, zeigt beim
  Kunden einen Hinweis und schreibt Beginn und Ende ins Audit.
- Umsatzzahlen der Shops nur als Summen, keine Einzelbestellungen oder Kundendaten.
- Aktionscodes anlegen, einem Kunden zuweisen, Einlösungen und Rabattumsatz auswerten.

## 14. Betrieb

- **Update-Pipeline** (GitHub Actions): Tests → Bauen der Container-Images → Staging
  (Migrationen, Smoke-Tests, Trennungstests) → manuelle Freigabe → Produktion mit
  rollierendem Neustart (alte und neue Version laufen kurz parallel; deshalb nur
  rückwärtskompatible Migrationen).
- **Sicherung**: pgBackRest mit WAL-Archiv in Object Storage (Wiederherstellung auf jede
  Minute), tägliche Vollsicherung, wöchentliche Kopie in die Storage Box; Bilder-Bucket
  mit Versionierung. **Monatlich automatisch**: Wiederherstellung auf einen frischen
  Staging-Server + Zahlenabgleich + Bericht per Mail (Fehler 9).
- **Überwachung**: Erreichbarkeit von außen, Serverwerte, Warteschlangenlänge,
  Sicherungsalter, Zertifikate; Fehlerverfolgung (GlitchTip, selbst betrieben, EU);
  Alarme per Mail; öffentliche Statusseite.
- **Betriebshandbuch** in `docs/saas/betrieb.md` (Phase G).

## 15. Datenschutz und Recht

Vorlagen zur **Prüfung durch einen Anwalt** (keine fertigen Rechtstexte):
AVV-Anlage, TOM-Liste, Liste der Unterauftragsverarbeiter (Hetzner — DE/FI; Stripe;
Anthropic — USA, Datenübermittlung und Rechtsgrundlage prüfen; Mail-Dienst — EU;
Rechtstexte-Dienst — DE; Google — nur bei SEO Plus, USA). Dieser Plan ist keine
Rechtsberatung.

## 16. Phasen und „fertig, wenn …“

**Neue Reihenfolge (29.09.2026):** Erst beweisen, dass Händler dafür zahlen, dann den
Selbstbedienungs-Weg für viele Kunden bauen. Pilotkunden richtet eg-dynamics anfangs
**von Hand** ein (über den Plattform-Admin); der vollautomatische Setup-Assistent
(Phase C) folgt erst nach bestandener Validierung.

```
A Fundament ──▶ B Umzug Winterfeld ──▶ M Marktplätze ──▶ P Pilotbetrieb ──▶ [Entscheidung]
      V Validierung (parallel ab sofort) ─────────────────────────────────────▲
                                                         ja ──▶ C ──▶ E ──▶ D ──▶ G
                                          F App (parallel ab B, wegen Play-Store-Wartezeiten)
```

| Phase | Inhalt | Fertig, wenn … |
|---|---|---|
| **A Fundament** (läuft) | Terraform/Ansible, Staging + Produktion, Mandanten-Tabellen, `tenant_id` + RLS in allen Tabellen, Trennungstests, Shop im Node-Modus auf Hetzner, eine Datenbank, Bilder im Object Storage, Sicherung + erste Test-Wiederherstellung, Update-Pipeline | Staging und Produktion per Befehl aufbaubar; Trennungstests grün (inkl. „jede Tabelle hat RLS“); Wiederherstellung auf Staging dokumentiert und einmal durchgeführt; Update ohne Ausfall vorgeführt |
| **V Validierung** (neu, parallel ab sofort, überwiegend deine Aufgabe) | Zeitmessung bei Winterfeld; 10–20 Gespräche mit Händlern der Zielgruppe (§ 0.1); Landingpage mit Warteliste und den fertigen Werbevideos; Gründerpreis-Angebot für Pilotkunden | Zeit je Artikel **vorher/nachher** bei Winterfeld gemessen und dokumentiert; mindestens 10 Gespräche ausgewertet; mindestens 5 Händler haben einer Pilotphase zugesagt |
| **B Umzug Winterfeld** | Migrationsskript, Probeläufe, Zahlenabgleich, Umschalten, Rückweg | zwei saubere Probeläufe; Umschalten erledigt; Abgleichbericht mit 0 Abweichungen; Tablets ohne Datenverlust umgestellt |
| **M Marktplätze** (neu, vorgezogen) | eBay-Anbindung mit Bestandsabgleich (§ 9a), Kanalwahl je Artikel, Abgleich-Bericht im Lager-Web | Doppelverkauf-Test in der eBay-Sandbox bestanden; Winterfeld verkauft produktiv über Shop und eBay |
| **P Pilotbetrieb** (neu) | 3–5 Pilotkunden, von Hand eingerichtet, Gründerpreis; Abrechnung zunächst über Stripe-Zahlungslinks; eigener Shop optional (Pakete „Lager + App“ mit eBay reicht) | Pilotkunden arbeiten mindestens 8 Wochen produktiv; Zeitersparnis bei ihnen gemessen; Rückmeldungen ausgewertet |
| **Entscheidung** | Go/No-Go nach den Kriterien unten | Kriterien erfüllt → weiter mit C; sonst Anpassung (§ 16.1) |
| **C Setup-Assistent** | alle 14 Schritte, Stripe Connect, DHL-Prüfanfrage, Mail-DNS, Domain-Assistent, Rechtstexte, Outbox Lager↔Shop, ein Konto für alles + 2FA, **Schritt „Marktplätze verbinden“** | neuer Testkunde kommt ohne Hilfe in < 30 Min. bis zur Testbestellung (ohne Wartezeiten externer Anbieter); kein Pflichtschritt überspringbar; Screenshots Desktop + Handy abgenommen |
| **E Abrechnung, Plattform-Admin, SEO Plus** | Stripe Billing, Meter, Sperrlogik, Export, Löschung, Plattform-Admin, Kostenübersicht, SEO Plus | Testphase → Abo → Verzug → Sperre → Entsperren im Testmodus durchgespielt; Kosten je Kunde sichtbar |
| **D Designs + SEO-Grundlagen** | Token-System, **3 Layouts, 12 Designs** (Ausbau auf 100 bei Bedarf), Galerie mit Live-Vorschau, SEO-Grundlagen | alle Designs bestehen Kontrast-, Handy- und Checkout-Prüfung; Sitemap, `robots.txt`, eine Canonical-Domain, gültige strukturierte Daten (Rich-Results-Test), `noindex` für Test/gesperrt |
| **F App** | Play-Store-Version, Mandanten-Login, Branding, targetSdk 36 | App in geschlossener Testphase freigegeben; Winterfeld-Tablets umgestellt |
| **G Betrieb** | Überwachung, Alarme, Statusseite, Betriebshandbuch, monatliche Test-Wiederherstellung | Alarm-Test ausgelöst und angekommen; Handbuch vorhanden |

Reihenfolge-Hinweis: **Phase F kann parallel ab B beginnen**, weil die Play-Store-
Zulassung (Organisations-Verifizierung, Testphase) Wochen dauern kann. Die Grundlagen der
Überwachung aus G (Erreichbarkeit, Sicherungsalter, Alarm per Mail) werden schon vor dem
ersten Pilotkunden eingerichtet.

### 16.1 Entscheidungskriterien nach der Pilotphase

| Kriterium | Ziel |
|---|---|
| Zeitersparnis je Artikel (Erfassen bis online) | mindestens **50 %** gegenüber vorher, gemessen bei Winterfeld und bei den Piloten |
| Zahlungsbereitschaft | mindestens **3 von 5** Piloten zahlen nach dem Gründerpreis-Zeitraum weiter |
| Nutzung | Piloten erfassen regelmäßig (mindestens wöchentlich) |
| Preis | Rückmeldung zu 59/129/189 € ausgewertet; `kostenmodell.md` danach überarbeitet |

Werden die Ziele verfehlt, gibt es drei Wege, die dann gemeinsam entschieden werden:
1. **Schärfen**: Das Paket auf „Erfassen + Marktplätze“ ohne eigenen Shop zuschneiden,
   günstiger und schneller zu bauen.
2. **Andere Nische**: Zielgruppe wechseln (z. B. Restposten-Großhandel statt Second-Hand).
3. **Intern halten**: Das System bleibt Winterfelds Werkzeug; der Aufwand für Fremdkunden
   (Setup-Assistent, Abrechnung, Support) entfällt.

Die Arbeit aus Phase A ist in allen drei Fällen nicht verloren: Sicherung, Server als Code
und saubere Datentrennung verbessern auch den Betrieb bei Winterfeld.

## 17. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Datenleck zwischen Mandanten | existenzbedrohend | RLS + Tests + „jede Tabelle hat RLS“-Test; Pentest vor dem ersten Fremdkunden |
| Datenverlust beim Umzug Winterfeld | hoch | Probeläufe, Zahlenabgleich, 14 Tage Rückweg |
| DHL-Produktionsfreigabe dauert | Versand-Schritt blockiert | sofort beantragen |
| Rechtstexte-Anbieter bieten keine Plattform-Anbindung | Livegang blockiert | früh anfragen; Alternative: eigene, anwaltliche Texte hochladen (Frage 5) |
| Stripe lehnt Managed Risk ab oder stellt Bedingungen | Haftungsfrage offen | vor Phase C mit Stripe klären; ohne Managed Risk **kein** Livegang von Fremdkunden |
| KI-Preise steigen | Marge sinkt | Kontingent und Aufpreis anpassbar; Budgetbremsen |
| Hetzner-Preise steigen weiter | Fixkosten | Infrastruktur-Code erlaubt Wechsel der Servergröße/-reihe |
| Ein einzelner Anwendungsserver fällt aus | alle Shops offline | Sicherung + Infrastruktur-Code: neuer Server in < 1 h; Floating IP umhängen. Hochverfügbarkeit (zwei Server + Load Balancer) erst ab ~50 Kunden, weil sie die Fixkosten etwa verdoppelt |
| Supabase-/Vercel-Daten beim Export unvollständig | Umzug verzögert | Export früh testen (Phase A) |
| Marktplätze bieten KI-Erfassung kostenlos (eBay, Shopify) | Hauptargument „KI“ zieht nicht | Positionierung über den **gesamten** Einzelstück-Ablauf inkl. Lager und Mehrkanal (§ 0.3); Zeitersparnis mit Zahlen belegen |
| eBay ändert Schnittstelle oder Richtlinien | Kanal fällt zeitweise aus | Anbindung als austauschbarer Adapter; Bestandsabgleich meldet Fehler sofort; eigener Shop bleibt als Kanal |
| Doppelverkauf eines Einzelstücks | Ärger mit Käufern, Bewertungen | Bestandsabgleich ist Pflicht, Test in der Sandbox (§ 9a) |
| Zu wenig Nachfrage | Aufwand ohne Ertrag | Phase V und P **vor** dem teuren Selbstbedienungs-Ausbau; Entscheidungskriterien § 16.1 |
| Kleine Händler kündigen schnell | Umsatz schwankt | Jahrestarif mit Rabatt; Einrichtung durch eg-dynamics; Erfolg der Piloten eng begleiten |
| Name „B.Y.O.B.“ nicht schützbar oder Domain belegt | Umbenennung nach dem Start teuer | Markenrecherche (DPMA/EUIPO) und Domainprüfung **vor** jeder Veröffentlichung von Werbung |
| Betrieb durch eine Person | Support- und Ausfallrisiko | Pilotphase klein halten; Betriebshandbuch; Überwachung mit Alarmen vor dem ersten Fremdkunden |

## 18. Aufgaben für dich (nicht programmierbar)

1. ~~Produktname und Produktdomain festlegen~~ — erledigt: eg-dynamics / eg-dynamics.de. Offen: Domain für Händler-Shops (siehe Festlegungen).
2. Hetzner-Projekt anlegen (ich sage dir genau, wo; du gibst mir **keine** Schlüssel in
   den Chat — sie kommen als Umgebungseinstellung/Geheimnis in die Pipeline).
3. Stripe: Plattformkonto für Connect freischalten, Managed-Risk-Bedingungen klären.
4. DHL-Entwicklerportal: App anlegen, Produktionsfreigabe beantragen.
5. Händlerbund und IT-Recht Kanzlei: Plattform-Anbindung anfragen.
6. Google Play: Entwicklerkonto als Organisation (D-U-N-S) beantragen.
7. Anwalt: AVV/TOM/Unterauftragsverarbeiter-Vorlagen prüfen lassen.
8. **Name B.Y.O.B.**: Markenrecherche beim DPMA und EUIPO (oder über einen Anwalt) und
   Verfügbarkeit einer Produktdomain prüfen — vor jeder Veröffentlichung der Werbevideos.
9. **Zeitmessung bei Winterfeld** (Phase V): für 20 Artikel die Zeit vom Auspacken bis
   „online“ notieren, einmal im alten Ablauf, einmal mit App und KI. Ich bereite dafür
   eine einfache Tabelle vor.
10. **10–20 Gespräche** mit Händlern der Zielgruppe (§ 0.1). Ich schreibe dir einen
    Gesprächsleitfaden mit 10 Fragen.
11. **eBay-Entwicklerkonto** anlegen (für Phase M), Zugang zur Sandbox.
