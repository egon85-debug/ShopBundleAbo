from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class AuditLog(Base, IdMixin, TimestampMixin):
    """Append-only Änderungsprotokoll (Anforderung 32).
    user_id bewusst ohne FK, damit Einträge Benutzerlöschungen überdauern."""

    __tablename__ = "audit_log"

    user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_name: Mapped[str | None] = mapped_column(String(120))
    entity_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    field: Mapped[str | None] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
