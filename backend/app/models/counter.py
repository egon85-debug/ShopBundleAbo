from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Counter(Base):
    """Fortlaufende Nummern (z. B. interne SKU WL-000245), race-sicher via row lock."""

    __tablename__ = "counters"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
