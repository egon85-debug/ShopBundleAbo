from sqlalchemy import JSON, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class AiRun(Base, IdMixin, TenantMixin, TimestampMixin):
    """Protokoll jedes KI-/Provider-Aufrufs — Rohdaten getrennt von Fachdaten."""

    __tablename__ = "ai_runs"
    __table_args__ = (Index("ix_ai_runs_created_at", "created_at"),)

    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # vision|stt|extraction|shoptext|…
    provider: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(128))
    input_ref: Mapped[str | None] = mapped_column(String(500))  # z. B. Storage-Key des Bildes
    raw_output: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    validated_output: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    confidence: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ok", nullable=False)  # ok|invalid|error
    error: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    # Verbrauch laut API (siehe services/ki_verbrauch.py); leer bei Aufrufen
    # ohne Anthropic (Test-Provider, wiederverwendete Ergebnisse).
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_read_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_write_tokens: Mapped[int | None] = mapped_column(Integer)
    web_searches: Mapped[int | None] = mapped_column(Integer)
    api_calls: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
