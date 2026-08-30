from enum import StrEnum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class LocationKind(StrEnum):
    SITE = "site"
    HALL = "hall"
    AREA = "area"
    SHELF = "shelf"
    LEVEL = "level"
    BIN = "bin"


class StorageLocation(Base, IdMixin, TimestampMixin):
    __tablename__ = "storage_locations"

    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("storage_locations.id", ondelete="RESTRICT"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Vollständiger Pfad-Code, z. B. "H2/A/B4/E3" — eindeutig und sprech-/scanbar.
    code: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    qr_code_value: Mapped[str | None] = mapped_column(String(255), unique=True)
