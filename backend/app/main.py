"""Winterfeld Logistik — Backend-API."""
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, captures, masterdata, products, shop
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
)


log = logging.getLogger("winterfeld.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startet den Job-Worker im selben Prozess, wenn so konfiguriert.

    Der Worker holt sich Jobs mit FOR UPDATE SKIP LOCKED — mehrere Worker sind
    also unbedenklich, aber unnötig. Als Daemon-Thread beendet er sich mit dem
    Prozess; SIGTERM des Hosters greift damit auch hier.
    """
    worker = None
    if get_settings().run_worker_in_process:
        from app.jobs.worker import Worker

        worker = Worker()
        threading.Thread(target=worker.run_forever, name="job-worker", daemon=True).start()
        log.info("Job-Worker läuft im API-Prozess")
    try:
        yield
    finally:
        if worker is not None:
            worker.stop()


class _AdminDateien(StaticFiles):
    """Verwaltungsoberflaeche immer frisch: ohne Cache-Control behalten Browser
    app.js und index.html nach eigenem Ermessen tagelang, und neue Ansichten
    kommen nach einem Update nicht an. "no-cache" fragt jedes Mal per ETag
    nach — unveraendert kostet das nur eine kurze 304-Antwort."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Winterfeld Logistik API",
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = "/api/v1"
    app.include_router(auth.router, prefix=prefix)
    app.include_router(captures.router, prefix=prefix)
    app.include_router(products.router, prefix=prefix)
    app.include_router(masterdata.router, prefix=prefix)
    app.include_router(shop.router, prefix=prefix)
    app.include_router(admin.router, prefix=prefix)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # HEAD gehoert dazu: Download-Manager auf dem Handy fragen damit zuerst
    # Groesse und Wiederaufnahme ab und brechen sonst ab (405).
    @app.api_route("/app", methods=["GET", "HEAD"], include_in_schema=False)
    def app_herunterladen():
        """Android-App zum Installieren (auf dem Handy im Browser oeffnen).
        FileResponse beherrscht Range-Anfragen: ein abgebrochener Download
        laesst sich fortsetzen. Bereitgestellt per `python -m app.cli app-holen`."""
        from fastapi.responses import FileResponse, PlainTextResponse

        from app.services import app_download
        info = app_download.bereitgestellt()
        if info is None:
            return PlainTextResponse(
                "Auf dem Server liegt noch keine App. Einrichten mit:\n"
                "docker compose exec api python -m app.cli app-holen\n", status_code=404)
        return FileResponse(app_download.apk_pfad(),
                            media_type="application/vnd.android.package-archive",
                            filename=info["name"],
                            headers={"Cache-Control": "no-cache"})

    # backend/admin im Quellbaum, /app/admin im Container — derselbe relative
    # Pfad, weil das Verzeichnis neben dem Paket "app" liegt. Der zweite
    # Kandidat faengt aeltere Arbeitskopien ab, in denen es noch im
    # Projektstamm lag.
    for admin_dir in (Path(__file__).resolve().parents[1] / "admin",
                      Path(__file__).resolve().parents[2] / "admin"):
        if admin_dir.is_dir():
            app.mount("/admin", _AdminDateien(directory=str(admin_dir), html=True),
                      name="admin")
            break

    return app


app = create_app()
