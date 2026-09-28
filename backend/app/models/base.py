import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class IdMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class TenantMixin:
    """Fachliche Daten gehören genau einem Mandanten (Händler).

    Die Spalte wird nie von Hand gesetzt: `app.tenancy` füllt sie beim Speichern
    aus dem Mandanten der Sitzung und filtert jede Abfrage danach. In PostgreSQL
    sichert zusätzlich Row Level Security jede Tabelle mit dieser Spalte ab.
    """

    @declared_attr
    def tenant_id(cls) -> Mapped[str]:
        return mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"),
                             index=True, nullable=False)
