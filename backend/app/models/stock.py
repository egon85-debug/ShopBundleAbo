from enum import StrEnum

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class MovementType(StrEnum):
    INBOUND = "inbound"
    SALE = "sale"
    MANUAL_CORRECTION = "manual_correction"
    RETURN = "return"
    DAMAGED = "damaged"
    RESERVED = "reserved"
    RELEASED = "released"
    INVENTORY_CORRECTION = "inventory_correction"


class StockMovement(Base, IdMixin, TimestampMixin):
    """Keine Bestandsänderung ohne Historieneintrag (Anforderung 17/32)."""

    __tablename__ = "stock_movements"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(String(255))  # z. B. Shop-Bestellnummer
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
