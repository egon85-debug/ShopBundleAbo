from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_engine = None
_SessionLocal = None
_plattform_engine = None
_PlattformSession = None


def _neue_engine(url: str):
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
    return create_engine(url, **kwargs)


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = _neue_engine(get_settings().database_url)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> sessionmaker:
    get_engine()
    return _SessionLocal


def get_plattform_sessionmaker() -> sessionmaker:
    """Sitzungen für Aufgaben über alle Mandanten (siehe app.tenancy).

    In Produktion zeigt DATABASE_URL_PLATTFORM auf eine eigene Datenbankrolle
    mit BYPASSRLS. Ohne eigene Adresse wird die normale Verbindung benutzt —
    das genügt nur ohne Row Level Security (SQLite, lokale Entwicklung).
    """
    global _plattform_engine, _PlattformSession
    if _PlattformSession is None:
        url = get_settings().database_url_plattform
        _plattform_engine = _neue_engine(url) if url else get_engine()
        _PlattformSession = sessionmaker(bind=_plattform_engine, autoflush=False,
                                         expire_on_commit=False)
    return _PlattformSession


def set_engine(engine, plattform_engine=None) -> None:
    """Für Tests: eigene Engine (z. B. SQLite in-memory) injizieren."""
    global _engine, _SessionLocal, _plattform_engine, _PlattformSession
    _engine = engine
    _SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    _plattform_engine = plattform_engine or engine
    _PlattformSession = sessionmaker(bind=_plattform_engine, autoflush=False,
                                     expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


# Registriert die Ereignisse der Mandantentrennung an allen Sitzungen.
import app.tenancy  # noqa: E402,F401
