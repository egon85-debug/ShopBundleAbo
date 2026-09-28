from enum import StrEnum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class LocationKind(StrEnum):
    SITE = "site"
    HALL = "hall"
    AREA = "area"
    SHELF = "shelf"
    LEVEL = "level"
    BIN = "bin"


class StorageLocation(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "storage_locations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_storage_locations_tenant_code"),
        UniqueConstraint("tenant_id", "qr_code_value", name="uq_storage_locations_tenant_qr"),
    )

    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("storage_locations.id", ondelete="RESTRICT"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Vollständiger Pfad-Code, z. B. "H2/A/B4/E3" — eindeutig und sprech-/scanbar.
    code: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    qr_code_value: Mapped[str | None] = mapped_column(String(255))
