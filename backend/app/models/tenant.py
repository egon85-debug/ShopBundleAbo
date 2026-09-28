from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin

# Kunde Nr. 1. Die Migration legt ihn mit dieser festen Kennung an und ordnet
# ihm alle Daten zu, die vor der Mandantenfähigkeit entstanden sind.
WINTERFELD_ID = "00000000-0000-4000-8000-000000000001"


class TenantStatus(StrEnum):
    TEST = "test"
    AKTIV = "aktiv"
    UEBERFAELLIG = "ueberfaellig"
    GESPERRT = "gesperrt"
    GEKUENDIGT = "gekuendigt"


class Tenant(Base, IdMixin, TimestampMixin):
    """Ein Händler (Mandant) der Plattform. Selbst keine Mandanten-Tabelle."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Kurzname für die Sofort-Adresse des Shops und die Verwaltungs-CLI.
    kurzname: Mapped[str] = mapped_column(String(63), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=TenantStatus.TEST.value, nullable=False)
    # Präfix der internen Artikelnummern, z. B. „WL“ → WL-000245.
    sku_praefix: Mapped[str] = mapped_column(String(8), default="ART", nullable=False)
    # Faire Warteschlange: wann dieser Mandant zuletzt einen Auftrag bekam.
    warteschlange_bedient_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Membership(Base, IdMixin, TimestampMixin):
    """Ein Konto gehört mit einer Rolle zu einem Mandanten — auch zu mehreren."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_memberships_user_tenant"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"),
                                           index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
