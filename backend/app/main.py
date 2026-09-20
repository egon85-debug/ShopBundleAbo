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

    # backend/admin im Quellbaum, /app/admin im Container — derselbe relative
    # Pfad, weil das Verzeichnis neben dem Paket "app" liegt. Der zweite
    # Kandidat faengt aeltere Arbeitskopien ab, in denen es noch im
    # Projektstamm lag.
    for admin_dir in (Path(__file__).resolve().parents[1] / "admin",
                      Path(__file__).resolve().parents[2] / "admin"):
        if admin_dir.is_dir():
            app.mount("/admin", StaticFiles(directory=str(admin_dir), html=True),
                      name="admin")
            break

    return app


app = create_app()
