"""Append-only Audit-Log (Anforderung 32)."""
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def log(
    db: Session,
    *,
    user: User | None,
    entity_type: str,
    entity_id: str | None,
    action: str,
    field: str | None = None,
    old_value=None,
    new_value=None,
    reason: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        user_name=user.display_name if user else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        reason=reason,
    )
    db.add(entry)
    return entry
