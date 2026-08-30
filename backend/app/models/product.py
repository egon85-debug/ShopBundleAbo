from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin


class Condition(StrEnum):
    NEW = "new"
    NEW_OPENED = "new_opened"
    REFURBISHED = "refurbished"
    USED = "used"
    DEFECTIVE = "defective"
    UNKNOWN = "unknown"


class ProcessingStatus(StrEnum):
    DRAFT = "draft"
    PHOTO_UPLOADED = "photo_uploaded"
    RECOGNITION_RUNNING = "recognition_running"
    PRODUCT_IDENTIFIED = "product_identified"
    PRICE_RESEARCH_RUNNING = "price_research_running"
    IMAGES_OPTIMIZING = "images_optimizing"
    SHOPTEXT_GENERATING = "shoptext_generating"
    REVIEW_REQUIRED = "review_required"
    SHOP_READY = "shop_ready"
    PUBLISHED = "published"
    ERROR = "error"


class PublicationStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    PUBLISH_FAILED = "publish_failed"


class Product(Base, IdMixin, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("stock_quantity >= 0", name="ck_stock_nonnegative"),
        CheckConstraint("reserved_quantity >= 0", name="ck_reserved_nonnegative"),
        CheckConstraint("reserved_quantity <= stock_quantity", name="ck_reserved_lte_stock"),
        Index("ix_products_manufacturer_model", "manufacturer", "model"),
    )

    internal_sku: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    # Idempotenz für Offline-Sync: vom Tablet generierte UUID der Erfassung.
    client_capture_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)

    ean: Mapped[str | None] = mapped_column(String(14), index=True)
    gtin: Mapped[str | None] = mapped_column(String(14), index=True)
    upc: Mapped[str | None] = mapped_column(String(12), index=True)
    mpn: Mapped[str | None] = mapped_column(String(64), index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255))
    product_name: Mapped[str | None] = mapped_column(String(500), index=True)
    model: Mapped[str | None] = mapped_column(String(255))
    short_description: Mapped[str | None] = mapped_column(Text)
    long_description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(255), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    technical_data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    condition: Mapped[str] = mapped_column(String(24), default=Condition.UNKNOWN.value, nullable=False)
    packaging_condition: Mapped[str | None] = mapped_column(String(255))

    purchase_price_net: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    purchase_price_gross: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    recommended_sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    minimum_sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    lowest_market_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    highest_market_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    average_market_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    median_market_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_research_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    invoice_number: Mapped[str | None] = mapped_column(String(64))
    storage_location_id: Mapped[str | None] = mapped_column(
        ForeignKey("storage_locations.id", ondelete="RESTRICT"), index=True
    )

    batch_number: Mapped[str | None] = mapped_column(String(64))
    serial_number: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)
    voice_transcript: Mapped[str | None] = mapped_column(Text)

    # KI-Metadaten: Confidence und Herkunft je Feld ("user" | "research" | "ai").
    field_confidence: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    field_sources: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Offene Rückfragen + Produktkandidaten der Recherche (bis zur Bestätigung).
    open_questions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    research_candidates: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    processing_status: Mapped[str] = mapped_column(
        String(32), default=ProcessingStatus.DRAFT.value, nullable=False, index=True
    )
    publication_status: Mapped[str] = mapped_column(
        String(32), default=PublicationStatus.DRAFT.value, nullable=False, index=True
    )
    # Kontrollbildschirm bestätigt?
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    supplier = relationship("Supplier", lazy="joined")
    storage_location = relationship("StorageLocation", lazy="joined")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")

    @property
    def available_quantity(self) -> int:
        return self.stock_quantity - self.reserved_quantity
