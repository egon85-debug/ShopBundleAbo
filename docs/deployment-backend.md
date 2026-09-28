# Backend in Betrieb nehmen

Das Backend ist ein Container: FastAPI-API und Job-Worker. Für eine kleine
Installation — ein Lager, wenige Tablets — laufen beide im selben Prozess
(`RUN_WORKER_IN_PROCESS=true`); das spart einen zweiten Dienst. Wächst die
Last, wird der Worker ohne Codeänderung ein eigener Dienst.

## Was gebraucht wird

| | |
|---|---|
| PostgreSQL 14+ | Daten, Auftragswarteschlange und Sperren (`FOR UPDATE SKIP LOCKED`) |
| Ein Host für Container | Fly.io, ein eigener Server mit Docker, jede vergleichbare Umgebung |
| Dauerhafte Ablage | Fotos, wenn `STORAGE_BACKEND=local`; bei `s3` nicht nötig |

Der Worker fragt die Datenbank alle zwei Sekunden nach Aufträgen. Ein Host, der
den Dienst bei Inaktivität schlafen legt, ist deshalb ungeeignet — Aufträge
blieben liegen, bis zufällig jemand die API aufruft.

## Pflicht-Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://benutzer:passwort@host:5432/datenbank` |
| `JWT_SECRET` | Signatur der Anmeldetoken — `openssl rand -hex 32` |
| `CREDENTIALS_KEY` | Fernet-Schlüssel für Shop-Zugangsdaten (siehe unten) |
| `ENVIRONMENT` | `production` — schaltet unter anderem `/docs` ab |
| `CORS_ORIGINS` | erlaubte Herkünfte, kommagetrennt |

Fernet-Schlüssel erzeugen:

```
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Der Schlüssel darf sich später nicht ändern** — sonst sind alle
verschlüsselten Shop-Zugangsdaten unlesbar. Alle weiteren Variablen (KI-Anbieter,
S3, Ratenbegrenzung) stehen in `backend/.env.example`.

## Mit Docker starten

```bash
cd backend
cp .env.example .env          # ausfüllen: DATABASE_URL, JWT_SECRET, CREDENTIALS_KEY
docker compose up -d --build
curl http://localhost:8000/health     # {"status":"ok"}
```

Das genügt mit einer verwalteten Datenbank (Supabase o. ä.). Wer ohne fremdes
Konto ausprobieren will, startet PostgreSQL gleich mit:

```bash
docker compose --profile lokale-db up -d --build
```

Der API-Container wartet beim Start selbst auf die Datenbank
(`DB_WAIT_SECONDS`, Vorgabe 60 s) und meldet im Klartext, wenn sie nicht
antwortet — ein frisch gestarteter PostgreSQL-Container braucht ein paar
Sekunden, und das soll den ersten Start nicht scheitern lassen.

### Supabase als Datenbank

Die Verbindungszeichenkette gehört aus dem Dashboard kopiert
(`Connect` → `Session pooler`), nicht geraten: der direkte Host
`db.<ref>.supabase.co` ist im kostenlosen Tarif nur über IPv6 erreichbar, der
Pooler antwortet auch über IPv4. Das Präfix muss `postgresql+psycopg2://`
lauten.

### Ins Netz stellen

Vor die API gehört ein Reverse Proxy mit TLS (Caddy, nginx). Die API selbst
spricht HTTP und vertraut `X-Forwarded-*` — sie darf deshalb **nicht** direkt
aus dem Internet erreichbar sein.

### Zu Hause oder im Betrieb hinter dem Router

Ein Rechner hinter einem gewöhnlichen Router hat keine feste öffentliche
Adresse, und der Router lässt eingehende Verbindungen nicht durch. Statt
Ports am Router zu öffnen, baut der Rechner selbst eine ausgehende Verbindung
zu Cloudflare auf, über die Anfragen an einen Namen wie `lager.ihre-domain.de`
hereinkommen:

```
docker compose --profile tunnel up -d --build
```

Voraussetzungen: ein Cloudflare-Konto (kostenlos), die Domain mit ihren
Nameservern bei Cloudflare, und ein Tunnel unter Zero Trust → Networks →
Tunnels. Das dort angezeigte Token kommt als `TUNNEL_TOKEN` in die `.env`.
Als „Public Hostname" des Tunnels wird der Dienst `http://api:8000`
eingetragen — der Tunnel-Container erreicht die API über das Compose-Netz,
der Port 8000 bleibt weiterhin nur lokal gebunden. TLS übernimmt Cloudflare,
Caddy wird in dieser Variante nicht gebraucht.

Damit der Shop die Bilder laden kann, muss `MEDIA_PUBLIC_BASE_URL` auf
`https://lager.ihre-domain.de/api/v1/media` zeigen. Und: der Rechner muss
durchlaufen. Der Shop meldet Verkäufe sofort ans Lager; ist der Rechner in
dem Moment aus, bleibt der Lagerbestand für diese Bestellung zu hoch.

## Fly.io

```bash
cd backend
fly launch --no-deploy --copy-config
fly secrets set DATABASE_URL='…' JWT_SECRET='…' CREDENTIALS_KEY='…'
fly deploy
```

`fly.toml` liegt bereit: Region Frankfurt, ein Rechner, Health-Check auf
`/health`, dauerhafte Ablage unter `/app/storage`. `auto_stop_machines` ist
bewusst aus — siehe oben.

## Migrationen

Sie laufen beim Start, wenn `RUN_MIGRATIONS=true` gesetzt ist, und sind
wiederholbar. Einzeln:

```bash
docker run --rm --env-file .env winterfeld-api migrate
```

## Startbefehle des Containers

| Befehl | Wirkung |
|---|---|
| `api` (Vorgabe) | FastAPI, optional mit Worker im selben Prozess |
| `worker` | nur der Job-Worker |
| `migrate` | Migrationen einspielen und beenden |

Mehrere Worker sind unbedenklich: Aufträge werden mit
`FOR UPDATE SKIP LOCKED` exklusiv übernommen, keiner wird doppelt bearbeitet.

## Nach dem ersten Start

1. **Erstes Konto anlegen** — `python -m app.cli create-admin --email …` im Container.
   Nach der Mandanten-Migration gehört es automatisch zur einzigen Firma; gibt es
   mehrere, mit `--mandant <kurzname>` (Firmen anlegen: `mandant-anlegen`, siehe
   `docs/saas/mandantentrennung.md`).
2. **Shop-Verbindung einrichten** — siehe `shop-integration.md`.
3. **Prüfen**: `/health` antwortet, `/docs` ist in Produktion nicht erreichbar,
   ein Testauftrag wird vom Worker abgearbeitet.

## Betrieb

- **Sicherung**: die Datenbank enthält alles außer den Bildern. Bei
  `STORAGE_BACKEND=local` gehört `/app/storage` mit in die Sicherung; mit `s3`
  liegt sie beim Speicheranbieter.
- **Protokolle**: JSON-Zeilen auf stdout, vom Host einsammelbar.
- **Fehlgeschlagene Aufträge** landen nach `JOB_MAX_ATTEMPTS` Versuchen im
  Fehlerzustand und sind über die Admin-Oberfläche sichtbar — sie verschwinden
  nicht still.
