from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class AiRun(Base, IdMixin, TimestampMixin):
    """Protokoll jedes KI-/Provider-Aufrufs — Rohdaten getrennt von Fachdaten."""

    __tablename__ = "ai_runs"

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
