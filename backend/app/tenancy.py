"""Mandantentrennung im Anwendungscode.

Jede Datenbank-Sitzung trägt ihren Mandanten in `session.info`. Daraus folgen
drei Dinge, ohne dass Router oder Services sich darum kümmern müssen:

1. Jede ORM-Abfrage (auch Nachladen von Beziehungen, UPDATE, DELETE) auf eine
   Tabelle mit `TenantMixin` bekommt die Bedingung `tenant_id = <Mandant>`.
   Ohne Mandant liefert sie nichts — sie schlägt zu, nicht auf.
2. Neue Datensätze bekommen beim Speichern den Mandanten der Sitzung. Ohne
   Mandant wird das Speichern verweigert (`KeinMandant`).
3. In PostgreSQL wird zu Beginn jeder Transaktion `app.tenant_id` gesetzt.
   Darauf prüft Row Level Security (Migration c5e7…) — die zweite Sicherung,
   falls im Code einmal etwas an der ersten vorbeigeht.

Aufgaben über alle Mandanten hinweg (Warteschlange verteilen, Webhook einem
Mandanten zuordnen) laufen in einer Plattform-Sitzung (`plattform_sitzung`).
Sie verbindet sich in Produktion mit einer eigenen Datenbankrolle, die Row
Level Security umgehen darf, und wird nur an diesen wenigen Stellen benutzt.
"""
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event, false, text
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.models.base import Base, TenantMixin

MANDANT = "tenant_id"
PLATTFORM = "plattform"


class KeinMandant(RuntimeError):
    """Es sollte gespeichert werden, ohne dass die Sitzung einen Mandanten kennt."""


def mandant_setzen(db: Session, tenant_id: str | None) -> None:
    """Mandanten der Sitzung festlegen — auch mitten in einer laufenden Transaktion."""
    db.info[MANDANT] = tenant_id
    if db.in_transaction() and _ist_postgres(db):
        _postgres_setzen(db.connection(), tenant_id)


def aktueller_mandant(db: Session) -> str | None:
    return db.info.get(MANDANT)


def ist_plattform(db: Session) -> bool:
    return bool(db.info.get(PLATTFORM))


def mandanten_tabellen() -> list[str]:
    """Alle Tabellen, deren Zeilen einem Mandanten gehören (für RLS und Tests)."""
    return sorted(
        mapper.local_table.name
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantMixin)
    )


@contextmanager
def plattform_sitzung() -> Iterator[Session]:
    """Sitzung ohne Mandantenfilter — nur für Aufgaben über alle Mandanten."""
    from app.db import get_plattform_sessionmaker
    db = get_plattform_sessionmaker()()
    db.info[PLATTFORM] = True
    try:
        yield db
    finally:
        db.close()


def mandant_von(model, datensatz_id: str) -> str | None:
    """Zu welchem Mandanten gehört dieser Datensatz? Für Zugänge ohne Anmeldung
    (Webhooks), die ihren Mandanten erst über die aufgerufene Adresse kennen."""
    with plattform_sitzung() as db:
        return db.scalar(model.__table__.select()
                         .with_only_columns(model.__table__.c.tenant_id)
                         .where(model.__table__.c.id == datensatz_id))


# ── Ereignisse ──────────────────────────────────────────────────────────────

def _ist_postgres(db: Session) -> bool:
    return db.get_bind().dialect.name == "postgresql"


def _postgres_setzen(connection, tenant_id: str | None) -> None:
    # Transaktionslokal (drittes Argument true): nach COMMIT/ROLLBACK ist der
    # Wert weg und kann nicht in eine fremde Anfrage durchsickern.
    connection.execute(text("SELECT set_config('app.tenant_id', :t, true)"),
                       {"t": tenant_id or ""})


@event.listens_for(Session, "do_orm_execute")
def _abfragen_filtern(state: ORMExecuteState) -> None:
    if ist_plattform(state.session):
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if state.execution_options.get("ohne_mandantenfilter"):
        return
    tenant_id = aktueller_mandant(state.session)
    if tenant_id is None:
        state.statement = state.statement.options(
            with_loader_criteria(TenantMixin, lambda cls: false(), include_aliases=True))
    else:
        state.statement = state.statement.options(
            with_loader_criteria(TenantMixin, lambda cls: cls.tenant_id == tenant_id,
                                 include_aliases=True))


@event.listens_for(Session, "before_flush")
def _mandant_eintragen(db: Session, _flush_context, _instances) -> None:
    tenant_id = aktueller_mandant(db)
    for obj in db.new:
        if not isinstance(obj, TenantMixin):
            continue
        if obj.tenant_id is None:
            if tenant_id is None:
                raise KeinMandant(
                    f"{type(obj).__name__} ohne Mandant: Sitzung hat keinen Mandanten")
            obj.tenant_id = tenant_id
        elif not ist_plattform(db) and tenant_id is not None and obj.tenant_id != tenant_id:
            raise KeinMandant(
                f"{type(obj).__name__} gehört zu einem anderen Mandanten als die Sitzung")


@event.listens_for(Session, "after_begin")
def _transaktion_beginnt(db: Session, _transaction, connection) -> None:
    if connection.dialect.name == "postgresql" and not ist_plattform(db):
        _postgres_setzen(connection, aktueller_mandant(db))


def konfiguration_pruefen() -> list[str]:
    """Hinweise, wenn die Datenbankrollen die Mandantentrennung schwächen.

    Wird beim Start protokolliert. Eine Anwendungsrolle mit Superuser- oder
    BYPASSRLS-Recht macht Row Level Security wirkungslos (die Filter im Code
    greifen weiter). Eine Plattform-Rolle ohne dieses Recht sieht nur Zeilen
    ohne Mandant — der Worker fände dann keine Aufträge.
    """
    from app.db import get_engine, get_plattform_sessionmaker
    hinweise: list[str] = []
    frage = text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        return hinweise
    with engine.connect() as c:
        if c.scalar(frage):
            hinweise.append("Die Anwendungsrolle umgeht Row Level Security (Superuser oder "
                            "BYPASSRLS). Die zweite Sicherung der Mandantentrennung ist "
                            "wirkungslos; siehe deploy/datenbank-rechte.sql.")
    with get_plattform_sessionmaker()() as db:
        if not db.scalar(frage):
            hinweise.append("DATABASE_URL_PLATTFORM fehlt oder die Rolle hat kein BYPASSRLS: "
                            "Der Job-Worker sieht keine Aufträge.")
    return hinweise
