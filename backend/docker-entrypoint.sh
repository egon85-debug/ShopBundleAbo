#!/bin/sh
# Startpunkt des Containers.
#
#   api      FastAPI-Anwendung (Vorgabe)
#   worker   nur der Job-Worker, als eigener Prozess
#   migrate  Migrationen einspielen und beenden
#
# Migrationen laufen vor dem Start, wenn RUN_MIGRATIONS=true gesetzt ist. Sie
# sind wiederholbar: ist alles eingespielt, tut Alembic nichts.
set -eu

# Auf die Datenbank warten. Ein frisch gestarteter PostgreSQL-Container ist
# nicht sofort bereit, und eine verwaltete Datenbank kann kurz nicht antworten.
# Ohne das Warten schlaegt der erste Start fehl, obwohl nichts kaputt ist.
warte_auf_datenbank() {
  versuch=0
  bis=${DB_WAIT_SECONDS:-60}
  while [ "$versuch" -lt "$bis" ]; do
    if python -c "
import sys
from sqlalchemy import create_engine, text
from app.config import get_settings
try:
    create_engine(get_settings().database_url, pool_pre_ping=True).connect().execute(text('select 1'))
except Exception:
    sys.exit(1)
" 2>/dev/null; then
      return 0
    fi
    versuch=$((versuch + 1))
    [ "$versuch" = 1 ] && echo "Warte auf die Datenbank …"
    sleep 1
  done
  echo "Datenbank nach ${bis}s nicht erreichbar — DATABASE_URL pruefen." >&2
  return 1
}

if [ "${RUN_MIGRATIONS:-false}" = "true" ] && [ "${1:-api}" != "migrate" ]; then
  warte_auf_datenbank
  echo "Migrationen werden eingespielt …"
  alembic upgrade head
fi

case "${1:-api}" in
  migrate)
    warte_auf_datenbank
    exec alembic upgrade head
    ;;
  worker)
    exec python -m app.jobs.worker
    ;;
  api)
    # Ein Uvicorn-Prozess je CPU waere fuer diese Last ueberdimensioniert; der
    # In-Prozess-Worker (RUN_WORKER_IN_PROCESS) liefe dann zudem mehrfach.
    exec uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --workers "${WEB_CONCURRENCY:-1}" \
      --proxy-headers \
      --forwarded-allow-ips='*'
    ;;
  *)
    exec "$@"
    ;;
esac
