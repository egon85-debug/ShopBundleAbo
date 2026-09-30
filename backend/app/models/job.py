from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin, utcnow


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"  # wird erneut versucht
    DEAD = "dead"  # max_attempts erschöpft → Adminbereich


class JobType(StrEnum):
    RECOGNIZE_PRODUCT = "recognize_product"
    RESEARCH_PRODUCT = "research_product"
    RESEARCH_PRICES = "research_prices"
    TRANSCRIBE_VOICE = "transcribe_voice"
    EXTRACT_VOICE_DATA = "extract_voice_data"
    OPTIMIZE_IMAGES = "optimize_images"
    GENERATE_SHOPTEXT = "generate_shoptext"
    PUBLISH_PRODUCT = "publish_product"
    SYNC_STOCK = "sync_stock"
    # Preis auf einem Kanal nachziehen (Verkaufspreis, Aufschlag oder fester Preis geändert).
    SYNC_PRICE = "sync_price"
    CLEANUP_VOICE = "cleanup_voice"
    # Verkäufe auf Marktplätzen (eBay …) abholen; plant sich selbst neu ein.
    MARKTPLATZ_ABGLEICH = "marktplatz_abgleich"
    # Marktplatzbestellung in den Shop-Admin geben (Versand mit DHL-Etikett).
    BESTELLUNG_WEITERGEBEN = "bestellung_weitergeben"
    # Sendungsnummer beim Marktplatz eintragen.
    VERSAND_MELDEN = "versand_melden"


class Job(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_run_at", "status", "run_at"),)

    job_type: Mapped[str] = mapped_column(String(48), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=JobStatus.QUEUED.value, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(128))
    last_error: Mapped[str | None] = mapped_column(Text)
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
