from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Membership, RefreshToken, Role, Tenant, User
from app.models.base import utcnow
from app.services import audit_service
from app.tenancy import aktueller_mandant, mandant_setzen
from app.utils import security


class AuthError(Exception):
    pass


class MandantWaehlen(AuthError):
    """Das Konto gehört zu mehreren Firmen; die Anmeldung braucht eine Auswahl."""

    def __init__(self, mandanten: list[dict]):
        super().__init__("Bitte die Firma auswählen")
        self.mandanten = mandanten


def mitgliedschaft_laden(db: Session, user: User, tenant_id: str) -> Membership | None:
    """Aktive Mitgliedschaft des Kontos in dieser Firma; setzt Rolle und Firma
    für die laufende Anfrage am Konto-Objekt."""
    mitgliedschaft = db.scalar(select(Membership).where(
        Membership.user_id == user.id, Membership.tenant_id == tenant_id,
        Membership.is_active.is_(True)))
    if mitgliedschaft is not None:
        user.role = mitgliedschaft.role
        user.tenant_id = tenant_id
    return mitgliedschaft


def create_user(db: Session, *, email: str, password: str, display_name: str,
                role: str = Role.EMPLOYEE.value, acting_user: User | None = None,
                tenant_id: str | None = None) -> User:
    """Konto anlegen und der Firma der Sitzung (oder `tenant_id`) zuordnen."""
    tenant_id = tenant_id or aktueller_mandant(db)
    if tenant_id is None:
        raise AuthError("Keine Firma angegeben")
    if role not in [r.value for r in Role]:
        raise AuthError(f"Unbekannte Rolle: {role}")
    if len(password) < 10:
        raise AuthError("Passwort muss mindestens 10 Zeichen haben")
    existing = db.scalar(select(User).where(User.email == email.lower()))
    if existing:
        raise AuthError("E-Mail bereits vergeben")
    user = User(email=email.lower(), password_hash=security.hash_password(password),
                display_name=display_name, legacy_role=role)
    db.add(user)
    db.flush()
    db.add(Membership(user_id=user.id, tenant_id=tenant_id, role=role))
    db.flush()
    user.role = role
    user.tenant_id = tenant_id
    if aktueller_mandant(db) == tenant_id:
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
    if aktueller_mandant(db) is not None:
        audit_service.log(db, user=acting_user, entity_type="user", entity_id=user.id,
                          action="password_reset")


def _firma_waehlen(db: Session, user: User, gewuenscht: str | None) -> str:
    """Firma für die Anmeldung: die gewünschte (ID oder Kurzname) oder die einzige."""
    zeilen = db.execute(
        select(Tenant.id, Tenant.kurzname, Tenant.name)
        .join(Membership, Membership.tenant_id == Tenant.id)
        .where(Membership.user_id == user.id, Membership.is_active.is_(True))
        .order_by(Tenant.name)).all()
    if gewuenscht:
        for tid, kurzname, _ in zeilen:
            if gewuenscht in (tid, kurzname):
                return tid
        raise AuthError("E-Mail oder Passwort falsch")
    if not zeilen:
        raise AuthError("E-Mail oder Passwort falsch")
    if len(zeilen) > 1:
        raise MandantWaehlen([{"id": t, "kurzname": k, "name": n} for t, k, n in zeilen])
    return zeilen[0][0]


def _tokens_ausstellen(db: Session, user: User, tenant_id: str) -> tuple[str, str]:
    access = security.create_access_token(user.id, user.role, tenant_id)
    refresh_plain, refresh_hash = security.new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, tenant_id=tenant_id, token_hash=refresh_hash,
        expires_at=utcnow() + timedelta(days=get_settings().refresh_token_days),
    ))
    return access, refresh_plain


def login(db: Session, *, email: str, password: str,
          mandant: str | None = None) -> tuple[User, str, str]:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not user.is_active or not security.verify_password(password, user.password_hash):
        # Ohne gültige Anmeldung ist keine Firma bekannt; der Fehlversuch landet
        # deshalb im Audit-Log jeder Firma, zu der das Konto gehört.
        if user is not None:
            for tid in db.scalars(select(Membership.tenant_id).where(
                    Membership.user_id == user.id)):
                mandant_setzen(db, tid)
                audit_service.log(db, user=None, entity_type="auth",
                                  entity_id=email.lower(), action="login_failed")
                db.flush()
            mandant_setzen(db, None)
        raise AuthError("E-Mail oder Passwort falsch")
    tenant_id = _firma_waehlen(db, user, mandant)
    mandant_setzen(db, tenant_id)
    if mitgliedschaft_laden(db, user, tenant_id) is None:
        raise AuthError("E-Mail oder Passwort falsch")
    access, refresh_plain = _tokens_ausstellen(db, user, tenant_id)
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
    if not user or not user.is_active or stored.tenant_id is None:
        raise AuthError("Benutzer inaktiv")
    mandant_setzen(db, stored.tenant_id)
    if mitgliedschaft_laden(db, user, stored.tenant_id) is None:
        raise AuthError("Benutzer inaktiv")
    stored.revoked_at = utcnow()
    access, refresh_plain = _tokens_ausstellen(db, user, stored.tenant_id)
    return user, access, refresh_plain


def logout(db: Session, *, refresh_token: str) -> None:
    stored = db.scalar(select(RefreshToken).where(
        RefreshToken.token_hash == security.hash_refresh_token(refresh_token)))
    if stored and stored.revoked_at is None:
        stored.revoked_at = utcnow()
