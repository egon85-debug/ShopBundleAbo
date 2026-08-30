from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin, utcnow


class PriceSource(Base, IdMixin, TimestampMixin):
    __tablename__ = "price_sources"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PriceResearchRun(Base, IdMixin, TimestampMixin):
    """Ein Eintrag je Recherche-Lauf → Preis-Historie (Anforderung 27)."""

    __tablename__ = "price_research_runs"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    lowest_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    highest_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    average_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    median_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    offer_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comparable_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    researched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PriceQuote(Base, IdMixin, TimestampMixin):
    """Einzelnes gefundenes Angebot inkl. Quelle und Vergleichbarkeits-Flags."""

    __tablename__ = "price_quotes"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    research_run_id: Mapped[str] = mapped_column(
        ForeignKey("price_research_runs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_id: Mapped[str | None] = mapped_column(ForeignKey("price_sources.id", ondelete="SET NULL"))
    source_name: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(1000))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    shipping_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    condition: Mapped[str] = mapped_column(String(24), default="unknown", nullable=False)
    is_comparable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_outlier: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exclusion_reason: Mapped[str | None] = mapped_column(String(255))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
