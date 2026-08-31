# Winterfeld Logistik – Backend (FastAPI + Job-Worker)
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libpq für psycopg2, curl für den Health-Check des Hosters.
RUN apt-get update \
 && apt-get install --no-install-recommends -y libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Erst die Abhängigkeiten – so bleibt diese Ebene zwischen Codeänderungen erhalten.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Ablage für lokal gespeicherte Medien (bei STORAGE_BACKEND=local).
RUN mkdir -p /app/storage

# Kein root im Betrieb.
RUN useradd --system --create-home --uid 10001 winterfeld \
 && chown -R winterfeld:winterfeld /app
USER winterfeld

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["api"]
