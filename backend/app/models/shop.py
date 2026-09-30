from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class ShopConnection(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "shop_connections"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_shop_connections_tenant_name"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_type: Mapped[str] = mapped_column(String(64), nullable=False)  # z. B. "woocommerce"
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # Fernet-verschlüsseltes JSON ({"consumer_key": …, "consumer_secret": …}); nie im API-Response.
    credentials_encrypted: Mapped[str | None] = mapped_column(Text)
    webhook_secret: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PublicationStatusEnum(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"
    DELISTED = "delisted"
    # Kanäle ohne Schnittstelle (Kleinanzeigen): vorbereitet, aber noch nicht von
    # Hand eingestellt – bzw. ausverkauft und von Hand zu löschen.
    VORBEREITET = "vorbereitet"
    ZU_LOESCHEN = "zu_loeschen"


class ShopPublication(Base, IdMixin, TenantMixin, TimestampMixin):
    """Protokoll jeder Veröffentlichung (Anforderung 38.14)."""

    __tablename__ = "shop_publications"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    connection_id: Mapped[str] = mapped_column(
        ForeignKey("shop_connections.id", ondelete="CASCADE"), index=True, nullable=False
    )
    external_id: Mapped[str | None] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(24), default=PublicationStatusEnum.PENDING.value, nullable=False)
    payload_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class ShopListing(Base, IdMixin, TenantMixin, TimestampMixin):
    """Generierte, vor Veröffentlichung editierbare Shoptexte."""

    __tablename__ = "shop_listings"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    seo_title: Mapped[str | None] = mapped_column(String(255))
    short_description: Mapped[str | None] = mapped_column(Text)
    long_description: Mapped[str | None] = mapped_column(Text)
    bullet_points: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    scope_of_delivery: Mapped[str | None] = mapped_column(Text)
    condition_note: Mapped[str | None] = mapped_column(Text)
    meta_title: Mapped[str | None] = mapped_column(String(255))
    meta_description: Mapped[str | None] = mapped_column(String(500))
    url_slug: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    suggested_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
