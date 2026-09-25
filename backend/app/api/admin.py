"""Admin/System: Dashboard, Benutzer, Jobs/Fehler, Audit-Log, Medien-Auslieferung."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db import get_db
from app.jobs import queue
from app.models import AuditLog, Job, JobStatus, Role, User
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


# ── Benutzerverwaltung (Admin) ──────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db),
               user: User = Depends(require_role(Role.ADMIN.value))):
    return db.scalars(select(User).order_by(User.email)).all()


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
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "Benutzer nicht gefunden")
    changes = body.model_dump(exclude_unset=True)
    password = changes.pop("password", None)
    if password:
        if len(password) < 10:
            raise HTTPException(422, "Passwort muss mindestens 10 Zeichen haben")
        target.password_hash = hash_password(password)
        audit_service.log(db, user=user, entity_type="user", entity_id=target.id,
                          action="update", field="password")
    for field, value in changes.items():
        old = getattr(target, field)
        if old != value:
            setattr(target, field, value)
            audit_service.log(db, user=user, entity_type="user", entity_id=target.id,
                              action="update", field=field, old_value=old, new_value=value)
    db.commit()
    return target


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
def get_media(key: str):
    """Liefert Bilder aus (Shop-Bilder müssen öffentlich erreichbar sein;
    Keys enthalten unratbare UUIDs)."""
    storage = get_storage()
    try:
        if not storage.exists(key):
            raise HTTPException(404, "Datei nicht gefunden")
        data = storage.get(key)
    except ValueError:
        raise HTTPException(400, "Ungültiger Pfad")
    content_type = "image/jpeg"
    if key.endswith(".png"):
        content_type = "image/png"
    elif key.endswith(".webp"):
        content_type = "image/webp"
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"})
