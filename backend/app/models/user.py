from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Role(StrEnum):
    EMPLOYEE = "employee"
    WAREHOUSE_MANAGER = "warehouse_manager"
    SHOP_MANAGER = "shop_manager"
    ADMIN = "admin"


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Früher die einzige Rolle. Seit der Mandantenfähigkeit steht die Rolle je
    # Firma in `memberships`; die Spalte bleibt nur, damit ältere Versionen
    # während eines Updates weiterlaufen, und wird später entfernt.
    legacy_role: Mapped[str | None] = mapped_column("role", String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ist_plattform_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Gelten nur für die laufende Anfrage: Rolle und Firma aus der Mitgliedschaft,
    # mit der sich das Konto angemeldet hat (siehe auth_service.mitgliedschaft_laden).
    role = None
    tenant_id = None


class RefreshToken(Base, IdMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # Die Firma, für die angemeldet wurde; die Erneuerung bleibt bei ihr.
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
