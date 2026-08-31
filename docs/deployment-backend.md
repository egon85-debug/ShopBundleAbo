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

## Eigener Server mit Docker

```bash
cd backend
cp .env.example .env          # ausfüllen: JWT_SECRET, CREDENTIALS_KEY, POSTGRES_PASSWORD
docker compose up -d --build
curl http://localhost:8000/health     # {"status":"ok"}
```

Die mitgelieferte `docker-compose.yml` bringt PostgreSQL mit. Bei einer
verwalteten Datenbank den Dienst `db` streichen und `DATABASE_URL` auf sie
zeigen lassen.

Vor die API gehört ein Reverse Proxy mit TLS (Caddy, nginx). Die API selbst
spricht HTTP und vertraut `X-Forwarded-*` — sie darf deshalb **nicht** direkt
aus dem Internet erreichbar sein.

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

1. **Erstes Konto anlegen** — `python -m app.cli` im Container.
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
