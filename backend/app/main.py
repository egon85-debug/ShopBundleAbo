"""Winterfeld Logistik — Backend-API."""
import logging
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


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Winterfeld Logistik API",
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
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

    admin_dir = Path(__file__).resolve().parents[2] / "admin"
    if admin_dir.is_dir():
        app.mount("/admin", StaticFiles(directory=str(admin_dir), html=True), name="admin")

    return app


app = create_app()
