# Winterfeldt Logistik – Backend (FastAPI + Job-Worker)
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

# Modell zum Freistellen der Shopbilder (IS-Net, ≈180 MB) gleich ins Image,
# damit der Server es nicht im Betrieb herunterladen muss. Pruefsumme wie bei
# rembg, das dieselbe Datei verteilt.
RUN mkdir -p /opt/modelle \
 && curl -fsSL -o /opt/modelle/isnet-general-use.onnx \
      https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx \
 && echo "fc16ebd8b0c10d971d3513d564d01e29  /opt/modelle/isnet-general-use.onnx" | md5sum -c - \
 && chmod -R a+rX /opt/modelle

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
# Der Verwaltungsbereich wird vom Backend unter /admin ausgeliefert.
COPY admin ./admin
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
