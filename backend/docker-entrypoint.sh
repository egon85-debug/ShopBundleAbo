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

if [ "${RUN_MIGRATIONS:-false}" = "true" ] && [ "${1:-api}" != "migrate" ]; then
  echo "Migrationen werden eingespielt …"
  alembic upgrade head
fi

case "${1:-api}" in
  migrate)
    exec alembic upgrade head
    ;;
  worker)
    exec python -m app.jobs.worker
    ;;
  api)
    # Ein Uvicorn-Prozess je CPU wäre für diese Last überdimensioniert; der
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
