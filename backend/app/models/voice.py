from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class VoiceRecording(Base, IdMixin, TenantMixin, TimestampMixin):
    """Sprachaufnahme; Audio wird nach Transkription gemäß Konfiguration gelöscht (DSGVO)."""

    __tablename__ = "voice_recordings"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    storage_key: Mapped[str | None] = mapped_column(String(500))  # None, wenn Client-Transkript
    transcript: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    retention_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    audio_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
