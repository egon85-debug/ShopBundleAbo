# Mandantentrennung im Lager-Backend

Stand: Phase A, Schritt 1 (28.09.2026). Gilt für `backend/`. Der Shop (`shop/`) folgt,
wenn Lager und Shop in eine Datenbank ziehen.

## Kurz erklärt

Jeder Händler ist ein **Mandant** (Tabelle `tenants`). Alle fachlichen Tabellen haben eine
Spalte `tenant_id`. Drei Sicherungen hintereinander sorgen dafür, dass Firma A nie Daten von
Firma B sieht:

| Sicherung | Wo | Was sie tut |
|---|---|---|
| 1. Filter im Code | `app/tenancy.py` | Jede Abfrage bekommt automatisch `tenant_id = <Firma der Sitzung>`; neue Datensätze bekommen die Firma beim Speichern. Ohne Firma: keine Treffer, Speichern verweigert. |
| 2. Row Level Security | Migration `c5e7f9a1b3d4` | PostgreSQL selbst gibt nur Zeilen der Firma heraus, die die Anwendung je Transaktion in `app.tenant_id` setzt. Gilt auch für den Tabelleneigentümer (`FORCE`). |
| 3. Tests | `tests/test_mandanten.py`, `tests/test_mandanten_postgres.py` | Siehe unten. Laufen in der CI bei jedem Push. |

## Woher die Firma kommt

| Zugang | Quelle |
|---|---|
| API, App, Lager-Web | Anmelde-Token (`tid`) + Mitgliedschaft; die Rolle wird bei jeder Anfrage frisch gelesen |
| Job-Worker | `tenant_id` des Auftrags |
| Webhooks (ohne Anmeldung) | Firma der aufgerufenen Shop-Verbindung; Schutz durch die Signatur |
| Verwaltungs-CLI | `--mandant <kurzname>` (bei nur einer Firma automatisch) |

## Konten und Rollen

- `users` ist ein **Konto** (E-Mail, Kennwort) — weltweit eindeutig.
- `memberships` ordnet ein Konto mit **Rolle** einer Firma zu. Ein Konto kann zu mehreren
  Firmen gehören; dann fragt die Anmeldung nach der Firma (HTTP 409 mit Liste, danach
  Login mit `"mandant": "<kurzname>"`).
- Ein Firmen-Admin sieht und ändert nur Konten seiner Firma. Das Kennwort eines Kontos,
  das auch zu einer anderen Firma gehört, kann er nicht ändern.
- `users.role` ist veraltet und wird in einer späteren Migration entfernt.

## Eindeutig je Firma

SKU (`WL-000001`), Lieferantenname, Lagerplatz-Code, QR-Wert, Erfassungs-ID des Tablets,
Shop-Verbindungsname, Preisquelle und Idempotenz-Schlüssel sind **je Firma** eindeutig.
Das SKU-Präfix steht je Firma in `tenants.sku_praefix` (Winterfeld: `WL`).

## Faire Warteschlange

Der Worker nimmt reihum den Auftrag der Firma, die am längsten keinen bekommen hat, und
höchstens `JOB_MAX_PARALLEL_JE_MANDANT` (Vorgabe 2) gleichzeitig je Firma.

## Datenbankrollen (Produktion)

| Rolle | Rechte | Verbindung |
|---|---|---|
| Eigentümer | besitzt Tabellen, führt Migrationen aus | nur Migration |
| Anwendung | Lesen/Schreiben, **ohne** BYPASSRLS | `DATABASE_URL` |
| Plattform | Lesen/Schreiben, **mit** BYPASSRLS | `DATABASE_URL_PLATTFORM` (Warteschlange, Webhook-Zuordnung) |

Rechte vergibt `backend/deploy/datenbank-rechte.sql`. Beim Start meldet das Backend im
Protokoll, wenn die Anwendungsrolle Row Level Security umgeht oder die Plattform-Rolle
fehlt.

**Heutige Einzelinstallation** (eine Superuser-Rolle aus `docker compose`): läuft weiter,
weil Superuser Row Level Security nicht unterliegen. Der Startlog weist darauf hin, dass
die zweite Sicherung dort wirkungslos ist; das ist bis zum Umzug (Phase B) so gewollt.

## Migration einspielen

Die Migration ordnet alle bestehenden Daten **Winterfeld Logistik** zu
(`tenants.id = 00000000-0000-4000-8000-000000000001`). Sie ist die bewusste Ausnahme von
„Updates ohne Ausfall“: Die alte Version kann danach nicht mehr speichern. Deshalb im
Wartungsfenster: alte Version stoppen → `migrate` → neue Version starten. Rückweg:
`alembic downgrade b4d2f6a8c0e1`, solange es nur eine Firma gibt (Test vorhanden).

## Was die Tests belegen

- **Jede API-Route mit einer Kennung** (automatisch aus der OpenAPI-Beschreibung, heute 27
  Kombinationen aus Route und Methode): Firma A setzt die Kennungen von Firma B ein — nie ein Erfolg, nie Inhalte von B.
  Gegenprobe: Ohne den Filter im Code schlagen 26 Tests fehl.
- Listen (Artikel, Konten, Audit-Log, Aufträge) zeigen nur die eigene Firma.
- Webhook mit der Verbindung von B bucht nur Bestand bei B, obwohl A dieselbe SKU hat.
- Worker führt jeden Auftrag im Mandanten des Auftrags aus; kleine Firma kommt trotz
  langer Schlange einer großen Firma sofort dran.
- **PostgreSQL**: Migration mit Altdaten (alles bei Winterfeld, Rollen übernommen);
  jede Tabelle mit `tenant_id` hat erzwungenes RLS (neue Tabelle ohne Regel → Test rot);
  ohne gesetzte Firma sieht die Anwendungsrolle **nichts**, auch der Eigentümer nicht;
  fremde Zeilen schreiben wird verweigert; Rücknahme der Migration funktioniert.

Lokal gegen PostgreSQL testen:

```bash
WF_TEST_POSTGRES="postgresql+psycopg2://postgres@/postgres?host=/tmp&port=5432" \
  python -m pytest tests/test_mandanten_postgres.py
```

## Bilder und Sprachaufnahmen (Schritt 2)

**Ablage je Firma** im Objekt-Storage:

```
m/<tenant_id>/produkte/<product_id>/original/…   Originalfoto (privat)
m/<tenant_id>/produkte/<product_id>/shop/…       Shopbild
m/<tenant_id>/produkte/<product_id>/sprache/…    Sprachaufnahme (privat)
```

Ältere Dateien (`products/…`) bleiben, wo sie sind, und funktionieren weiter; beim Umzug
(Phase B) werden sie in die neue Ablage kopiert.

**Wer bekommt was** (`GET /api/v1/media/<pfad>`, Regeln in `app/services/medien.py`):

| Datei | ohne Signatur | mit Signatur |
|---|---|---|
| Originalfoto | nein | ja |
| Shopbild, Artikel nicht veröffentlicht | nein | ja |
| Shopbild, Artikel veröffentlicht | **ja** (der Shop bindet es ein) | ja |
| Sprachaufnahme | nein | nein |
| unbekannter Pfad | nein (404) | nein (404) |

- Signierte Adressen stehen nur in API-Antworten an angemeldete Nutzer der eigenen Firma.
  Die Signatur gilt für genau eine Datei, ist 24–48 Stunden gültig und bleibt einen Tag
  lang gleich (damit Browser und App Bilder zwischenspeichern können).
- Abgelehnt wird immer mit 404 — auch wenn es die Datei gibt —, damit sich fremde Dateien
  nicht ertasten lassen.
- Signiert ausgelieferte Bilder tragen `Cache-Control: private` (kein geteilter
  Zwischenspeicher), veröffentlichte Shopbilder `public`.
- `MEDIA_PUBLIC_BASE_URL` darf auf ein CDN zeigen, das an diesen Endpunkt weiterreicht —
  **nie direkt auf den Speicher-Bucket**, sonst entfiele die Prüfung.
- Lager-Web und App brauchen keine Änderung: Sie benutzen die Adresse aus der API.

Tests: `tests/test_medien.py` (Gegenprobe: akzeptiert man jede Signatur, schlagen 4 Tests
fehl).

## Noch offen (folgende Schritte in Phase A)

- Shopbilder nur unter der Domain des eigenen Shops ausliefern (kommt mit dem Umzug des
  Shops auf die Plattform).
- Shop auf dieselbe Datenbank und dieselbe Trennung umstellen.
- Infrastruktur-Code (Terraform/Ansible) legt die drei Datenbankrollen an.
