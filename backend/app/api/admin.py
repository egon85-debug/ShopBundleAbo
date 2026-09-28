"""Admin/System: Dashboard, Benutzer, Jobs/Fehler, Audit-Log, Medien-Auslieferung."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db import get_db
from app.jobs import queue
from app.models import AuditLog, Job, JobStatus, Membership, Role, User
from app.providers.registry import get_storage
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.schemas.misc import AuditLogOut, DashboardOut, JobOut
from app.services import audit_service, auth_service, product_service
from app.utils.security import hash_password

router = APIRouter(tags=["admin"])
log = logging.getLogger("winterfeld.app")


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    counts = product_service.dashboard_counts(db)
    pending = db.scalar(select(func.count()).select_from(Job).where(
        Job.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value,
                        JobStatus.FAILED.value]))) or 0
    failed = db.scalar(select(func.count()).select_from(Job).where(
        Job.status == JobStatus.DEAD.value)) or 0
    return DashboardOut(**counts, pending_jobs=pending, failed_jobs=failed)


@router.get("/ki-kosten")
def ki_kosten(tage: int = 30, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    """KI-Kosten der letzten Tage und des laufenden Monats (US-Dollar)."""
    from datetime import timedelta

    from app.models.base import utcnow
    from app.services import ki_verbrauch
    jetzt = utcnow()
    tage = max(1, min(tage, 366))
    from app.config import get_settings
    return {
        "modell": get_settings().anthropic_model,
        "budget_je_artikel_usd": str(ki_verbrauch.budget_usd()),
        "zeitraum": ki_verbrauch.uebersicht(db, jetzt - timedelta(days=tage)),
        "monat": ki_verbrauch.uebersicht(
            db, jetzt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)),
    }


# ── Benutzerverwaltung (Admin) ──────────────────────────────────────────────

def _mitglieder(db: Session, tenant_id: str):
    return select(User, Membership).join(Membership, Membership.user_id == User.id).where(
        Membership.tenant_id == tenant_id)


def _user_out(user: User, mitgliedschaft: Membership) -> UserOut:
    return UserOut(id=user.id, email=user.email, display_name=user.display_name,
                   role=mitgliedschaft.role,
                   is_active=user.is_active and mitgliedschaft.is_active)


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db),
               user: User = Depends(require_role(Role.ADMIN.value))):
    """Nur die Konten der eigenen Firma."""
    zeilen = db.execute(_mitglieder(db, user.tenant_id).order_by(User.email)).all()
    return [_user_out(u, m) for u, m in zeilen]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db),
                user: User = Depends(require_role(Role.ADMIN.value))):
    try:
        new_user = auth_service.create_user(
            db, email=body.email, password=body.password,
            display_name=body.display_name, role=body.role, acting_user=user)
    except auth_service.AuthError as exc:
        raise HTTPException(422, str(exc))
    db.commit()
    return new_user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_role(Role.ADMIN.value))):
    zeile = db.execute(_mitglieder(db, user.tenant_id).where(User.id == user_id)).first()
    if zeile is None:
        raise HTTPException(404, "Benutzer nicht gefunden")
    target, mitgliedschaft = zeile
    changes = body.model_dump(exclude_unset=True)
    password = changes.pop("password", None)
    if password:
        # Ein Konto kann zu mehreren Firmen gehören. Dessen Kennwort darf der
        # Admin einer dieser Firmen nicht ändern — sonst käme er in die anderen.
        andere = db.scalar(select(func.count()).select_from(Membership).where(
            Membership.user_id == target.id, Membership.tenant_id != user.tenant_id))
        if andere:
            raise HTTPException(409, "Das Konto gehört auch zu einer anderen Firma. "
                                     "Das Kennwort kann nur die Person selbst ändern.")
        if len(password) < 10:
            raise HTTPException(422, "Passwort muss mindestens 10 Zeichen haben")
        target.password_hash = hash_password(password)
        audit_service.log(db, user=user, entity_type="user", entity_id=target.id,
                          action="update", field="password")
    if "role" in changes and changes["role"] not in [r.value for r in Role]:
        raise HTTPException(422, f"Unbekannte Rolle: {changes['role']}")
    for field, value in changes.items():
        # Rolle und Sperre gelten je Firma, der Anzeigename für das ganze Konto.
        ziel = mitgliedschaft if field in ("role", "is_active") else target
        old = getattr(ziel, field)
        if old != value:
            setattr(ziel, field, value)
            audit_service.log(db, user=user, entity_type="user", entity_id=target.id,
                              action="update", field=field, old_value=old, new_value=value)
    db.commit()
    return _user_out(target, mitgliedschaft)


# ── Jobs / Synchronisationsfehler ───────────────────────────────────────────

@router.get("/jobs", response_model=list[JobOut])
def list_jobs(status: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(require_role(Role.ADMIN.value,
                                                Role.WAREHOUSE_MANAGER.value))):
    stmt = select(Job).order_by(Job.run_at.desc()).limit(200)
    if status:
        stmt = stmt.where(Job.status == status)
    return db.scalars(stmt).all()


@router.post("/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str, db: Session = Depends(get_db),
              user: User = Depends(require_role(Role.ADMIN.value))):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job nicht gefunden")
    queue.retry_now(db, job)
    audit_service.log(db, user=user, entity_type="job", entity_id=job.id, action="retry")
    db.commit()
    return {"detail": "Job neu eingeplant"}


# ── Audit-Log ───────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=list[AuditLogOut])
def audit_log(entity_type: str | None = None, entity_id: str | None = None,
              limit: int = 200, db: Session = Depends(get_db),
              user: User = Depends(require_role(Role.ADMIN.value,
                                                Role.WAREHOUSE_MANAGER.value))):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 1000))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    return db.scalars(stmt).all()


# ── Absturzberichte der App ─────────────────────────────────────────────────

class ClientErrorIn(BaseModel):
    kind: str = Field("crash", max_length=32)   # crash | anr
    app_version: str | None = Field(None, max_length=64)
    device: str | None = Field(None, max_length=200)
    report: str = Field(..., max_length=100_000)


@router.post("/client-errors", status_code=204)
def client_error(body: ClientErrorIn, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Die App schickt nach einem Absturz oder Einfrieren beim naechsten Start
    den Bericht (Stacktrace, Version, Geraet). Er landet im Server-Log und im
    Audit-Log, damit sich Fehler auf dem Handy ohne Kabel nachvollziehen lassen.
    Enthaelt keine Tokens oder Schluessel — nur den Programmablauf."""
    log.error("App-Absturz (%s) von %s, Version %s, %s\n%s",
              body.kind, user.email, body.app_version, body.device, body.report)
    audit_service.log(db, user=user, entity_type="app", entity_id=None,
                      action=f"client_{body.kind}", new_value=body.app_version,
                      reason=f"{body.device}\n{body.report}")
    db.commit()
    return Response(status_code=204)


# ── Medien-Auslieferung ─────────────────────────────────────────────────────

@router.get("/media/{key:path}")
def get_media(key: str, ablauf: str | None = None, sig: str | None = None):
    """Bilder ausliefern — mit Signatur jedes Bild der eigenen Firma, ohne
    Signatur nur Shopbilder veröffentlichter Artikel. Regeln: services/medien.py.

    Kommt ohne Anmeldung (<img> im Browser, Shop); die Zuordnung zur Firma
    läuft deshalb über die Plattform-Sitzung.
    """
    from app.models import Product, ProductImage, PublicationStatus
    from app.services import medien
    from app.tenancy import plattform_sitzung

    nicht_gefunden = HTTPException(404, "Datei nicht gefunden")
    with plattform_sitzung() as db:
        zeile = db.execute(
            select(ProductImage.kind, Product.publication_status)
            .join(Product, Product.id == ProductImage.product_id)
            .where(ProductImage.storage_key == key)).first()
    if zeile is None:
        # Auch Sprachaufnahmen und unbekannte Pfade: nie ausliefern.
        raise nicht_gefunden
    art, veroeffentlichung = zeile
    signiert = medien.signatur_pruefen(key, ablauf, sig)
    oeffentlich = (art == "optimized" and veroeffentlichung in (
        PublicationStatus.PUBLISHING.value, PublicationStatus.PUBLISHED.value))
    if not (signiert or oeffentlich):
        raise nicht_gefunden

    storage = get_storage()
    try:
        if not storage.exists(key):
            raise nicht_gefunden
        data = storage.get(key)
    except ValueError:
        raise nicht_gefunden
    content_type = "image/jpeg"
    if key.endswith(".png"):
        content_type = "image/png"
    elif key.endswith(".webp"):
        content_type = "image/webp"
    # Veröffentlichte Shopbilder dürfen Zwischenspeicher (CDN) teilen; alles,
    # was nur mit Signatur kommt, nur der Browser dessen, der es abruft.
    cache = "public, max-age=86400" if oeffentlich else "private, max-age=86400"
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": cache, "X-Content-Type-Options": "nosniff"})
