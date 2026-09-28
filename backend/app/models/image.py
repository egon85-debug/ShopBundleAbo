from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class ImageKind(StrEnum):
    ORIGINAL = "original"
    OPTIMIZED = "optimized"


class ImageRole(StrEnum):
    FRONT = "front"
    BACK = "back"
    PACKAGING = "packaging"
    BARCODE = "barcode"
    TYPE_PLATE = "type_plate"
    SERIAL_NUMBER = "serial_number"
    ACCESSORIES = "accessories"
    DAMAGE = "damage"
    OTHER = "other"


class ProductImage(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "product_images"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), default=ImageKind.ORIGINAL.value, nullable=False)
    role: Mapped[str] = mapped_column(String(24), default=ImageRole.OTHER.value, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), default="image/jpeg", nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Optimierte Bilder verweisen auf ihr Original — Originale werden nie überschrieben.
    source_image_id: Mapped[str | None] = mapped_column(ForeignKey("product_images.id", ondelete="SET NULL"))

    product = relationship("Product", back_populates="images")
