# Sicherheits- & Datenschutzkonzept

## Authentifizierung & Autorisierung

- Login mit E-Mail + Passwort; Passwörter mit PBKDF2-SHA256 (600k Iterationen, Salt) gehasht.
- Kurzlebige JWT-Access-Tokens (15 min) + rotierende Refresh-Tokens (14 Tage, Hash in DB,
  Widerruf bei Logout/Refresh; Wiederverwendung eines rotierten Tokens widerruft die Kette).
- Rollenmodell serverseitig erzwungen (FastAPI-Dependencies):
  `employee` (erfassen, eigenen Bestand einsehen, eigene Erfassungen bearbeiten),
  `warehouse_manager` (+ Artikel/Bestand korrigieren, Lieferanten, Freigabe),
  `shop_manager` (+ Shoptexte, Preise, Bilder, Veröffentlichen),
  `admin` (alles + Benutzer, Shop-/API-Verbindungen, KI-Konfiguration).

## Transport & Secrets

- Ausschließlich HTTPS (TLS-Terminierung am Reverse Proxy; HSTS; Backend erzwingt
  `secure`-Konfiguration in Produktion).
- **Keine Secrets im Quellcode oder im Android-Client.** Alle API-Keys (Vision, LLM, STT,
  Recherche, S3) liegen in Server-Env-Variablen (`.env` nur lokal, nie im Repo —
  `.env.example` dokumentiert alle Variablen).
- Shop-Credentials werden mit Fernet (AES-128-CBC+HMAC, Schlüssel `CREDENTIALS_KEY` aus Env)
  verschlüsselt in der DB gespeichert und über die API niemals zurückgegeben.
- Externe KI-/Recherche-Aufrufe erfolgen ausschließlich vom Backend aus.

## API-Härtung

- Serverseitige Validierung aller Eingaben (Pydantic, strikte Typen; Geld als Decimal).
- Rate Limiting (Token-Bucket in-process, per IP+Route) auf `/auth/*` und Uploads;
  in größerem Betrieb via Reverse Proxy/Redis ersetzbar.
- Upload-Limits (Größe, Content-Type-Whitelist für Bilder/Audio), Bild-Reencoding
  serverseitig (entschärft manipulierte Dateien, entfernt EXIF-Standortdaten).
- Webhooks HMAC-signiert; Idempotency-Keys gegen Replay-Duplikate.
- Audit-Log ist append-only; Anmeldungen und fehlgeschlagene Logins werden protokolliert.

## Backups & Betrieb

- PostgreSQL: tägliche Basissicherung + WAL-Archivierung (PITR); Objekt-Storage mit
  Versionierung/Replikation. Wiederherstellung dokumentiert und regelmäßig getestet.
- Monitoring: strukturiertes Logging (JSON), `/health`, Job-Fehlerübersicht im Admin.

## Datenschutz (DSGVO-orientiert)

- **Sprachaufnahmen**: Standardmäßig wird die Audiodatei unmittelbar nach erfolgreicher
  Transkription gelöscht (`VOICE_RETENTION_HOURS=0`); der Admin kann eine andere zulässige
  Aufbewahrung konfigurieren. Das Transkript ist Teil des Produktdatensatzes.
- **Mikrofon-Transparenz**: Die App zeigt während der Aufnahme dauerhaft und deutlich
  „● Spracheingabe läuft …“ mit Abbruch-Button; Aufnahme startet nur im Erfassungskontext.
- Personenbezug minimal: Benutzerkonten nur mit dienstlichen Daten; Audit-Log dient der
  Nachvollziehbarkeit betrieblicher Änderungen (berechtigtes Interesse), Aufbewahrung
  konfigurierbar.
- EXIF-Metadaten (u. a. GPS) werden beim Bild-Reencoding entfernt.
- Auskunft/Löschung: Benutzer können deaktiviert werden; personenbezogene Felder sind
  klar lokalisiert (users, audit_log.user_id) und damit exportier-/anonymisierbar.
