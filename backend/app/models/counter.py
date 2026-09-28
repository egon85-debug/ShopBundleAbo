from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin


class Counter(Base, TenantMixin):
    """Fortlaufende Nummern je Mandant (z. B. interne SKU WL-000245), race-sicher via row lock."""

    __tablename__ = "counters"

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"),
                                           primary_key=True)
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
