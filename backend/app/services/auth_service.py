from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import RefreshToken, Role, User
from app.models.base import utcnow
from app.services import audit_service
from app.utils import security


class AuthError(Exception):
    pass


def create_user(db: Session, *, email: str, password: str, display_name: str,
                role: str = Role.EMPLOYEE.value, acting_user: User | None = None) -> User:
    if role not in [r.value for r in Role]:
        raise AuthError(f"Unbekannte Rolle: {role}")
    if len(password) < 10:
        raise AuthError("Passwort muss mindestens 10 Zeichen haben")
    existing = db.scalar(select(User).where(User.email == email.lower()))
    if existing:
        raise AuthError("E-Mail bereits vergeben")
    user = User(email=email.lower(), password_hash=security.hash_password(password),
                display_name=display_name, role=role)
    db.add(user)
    db.flush()
    audit_service.log(db, user=acting_user, entity_type="user", entity_id=user.id,
                      action="create", new_value=email.lower())
    return user



def set_password(db: Session, *, user: User, password: str,
                 acting_user: User | None = None) -> None:
    """Kennwort ersetzen und alle offenen Sitzungen des Kontos beenden.

    Wer sein Kennwort zuruecksetzt, tut das oft, weil er nicht weiss, wer es
    sonst noch kennt — deshalb verlieren auch bereits angemeldete Geraete
    ihren Zugang.
    """
    if len(password) < 10:
        raise AuthError("Passwort muss mindestens 10 Zeichen haben")
    user.password_hash = security.hash_password(password)
    for token in db.scalars(select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        token.revoked_at = utcnow()
    audit_service.log(db, user=acting_user, entity_type="user", entity_id=user.id,
                      action="password_reset")

def login(db: Session, *, email: str, password: str) -> tuple[User, str, str]:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not user.is_active or not security.verify_password(password, user.password_hash):
        audit_service.log(db, user=None, entity_type="auth", entity_id=email.lower(),
                          action="login_failed")
        raise AuthError("E-Mail oder Passwort falsch")
    access = security.create_access_token(user.id, user.role)
    refresh_plain, refresh_hash = security.new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=refresh_hash,
        expires_at=utcnow() + timedelta(days=get_settings().refresh_token_days),
    ))
    audit_service.log(db, user=user, entity_type="auth", entity_id=user.id, action="login")
    return user, access, refresh_plain


def refresh(db: Session, *, refresh_token: str) -> tuple[User, str, str]:
    token_hash = security.hash_refresh_token(refresh_token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not stored:
        raise AuthError("Ungültiger Refresh-Token")
    if stored.revoked_at is not None:
        # Wiederverwendung eines rotierten Tokens → gesamte Kette des Nutzers widerrufen.
        for t in db.scalars(select(RefreshToken).where(
                RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))):
            t.revoked_at = utcnow()
        raise AuthError("Refresh-Token wurde bereits verwendet")
    if stored.expires_at.replace(tzinfo=None) < utcnow().replace(tzinfo=None):
        raise AuthError("Refresh-Token abgelaufen")
    user = db.get(User, stored.user_id)
    if not user or not user.is_active:
        raise AuthError("Benutzer inaktiv")
    stored.revoked_at = utcnow()
    access = security.create_access_token(user.id, user.role)
    refresh_plain, refresh_hash = security.new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=refresh_hash,
        expires_at=utcnow() + timedelta(days=get_settings().refresh_token_days),
    ))
    return user, access, refresh_plain


def logout(db: Session, *, refresh_token: str) -> None:
    stored = db.scalar(select(RefreshToken).where(
        RefreshToken.token_hash == security.hash_refresh_token(refresh_token)))
    if stored and stored.revoked_at is None:
        stored.revoked_at = utcnow()
