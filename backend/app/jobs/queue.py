"""PostgreSQL-basierte Job-Queue: transaktional mit den Fachdaten, Claim über
FOR UPDATE SKIP LOCKED, Retry mit Exponential-Backoff + Jitter (Anforderung 20/31)."""
import random
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Job, JobStatus
from app.models.base import utcnow


def enqueue(db: Session, *, job_type: str, payload: dict | None = None,
            product_id: str | None = None, delay_seconds: int = 0) -> Job:
    job = Job(
        job_type=job_type,
        payload=payload or {},
        product_id=product_id,
        max_attempts=get_settings().job_max_attempts,
        run_at=utcnow() + timedelta(seconds=delay_seconds),
    )
    db.add(job)
    db.flush()
    return job


def wartet(db: Session, *, product_id: str, job_type: str) -> bool:
    """Liegt fuer den Artikel schon ein Auftrag dieser Art, der noch nicht lief?"""
    return db.scalar(select(Job.id).where(
        Job.product_id == product_id, Job.job_type == job_type,
        Job.status.in_([JobStatus.QUEUED.value, JobStatus.FAILED.value])).limit(1)) is not None


HAENGT_GRUND = ("Abgebrochen: Die Verarbeitung wurde unterbrochen (z. B. durch einen "
                "Neustart des Servers) und wird automatisch wiederholt.")


def haengende_freigeben(db: Session) -> int:
    """Aufträge, die seit `job_stale_minutes` auf „running“ stehen, wieder einplanen.

    Stirbt der Prozess mitten in einem Auftrag (Neustart, Update, Absturz),
    räumt niemand die Sperre ab – der Auftrag bliebe für immer „running“.
    Mit ausgeschöpften Versuchen wird er „dead“ (sichtbar mit „Erneut
    versuchen“), sonst sofort wieder fällig.
    """
    grenze = utcnow() - timedelta(minutes=get_settings().job_stale_minutes)
    haengend = (Job.status == JobStatus.RUNNING.value, Job.locked_at < grenze)
    frei = {"locked_at": None, "locked_by": None}
    tot = db.execute(update(Job).where(*haengend, Job.attempts >= Job.max_attempts)
                     .values(status=JobStatus.DEAD.value, last_error=HAENGT_GRUND, **frei)
                     .execution_options(synchronize_session=False)).rowcount
    neu = db.execute(update(Job).where(*haengend)
                     .values(status=JobStatus.FAILED.value, run_at=utcnow(),
                             last_error=HAENGT_GRUND, **frei)
                     .execution_options(synchronize_session=False)).rowcount
    if tot or neu:
        db.commit()
    return (tot or 0) + (neu or 0)


def claim_next(db: Session, worker_id: str) -> Job | None:
    """Nächsten fälligen Job exklusiv übernehmen."""
    haengende_freigeben(db)
    stmt = (
        select(Job)
        .where(Job.status.in_([JobStatus.QUEUED.value, JobStatus.FAILED.value]),
               Job.run_at <= utcnow())
        .order_by(Job.run_at)
        .limit(1)
    )
    if db.get_bind().dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    job = db.scalar(stmt)
    if job is None:
        return None
    job.status = JobStatus.RUNNING.value
    job.locked_at = utcnow()
    job.locked_by = worker_id
    job.attempts += 1
    db.commit()
    return job


def mark_done(db: Session, job: Job) -> None:
    job.status = JobStatus.DONE.value
    job.locked_at = None
    job.locked_by = None
    db.commit()


def mark_failed(db: Session, job: Job, error: str) -> None:
    """Retry mit Backoff; nach max_attempts → DEAD (sichtbar im Adminbereich)."""
    job.last_error = error[:4000]
    job.locked_at = None
    job.locked_by = None
    if job.attempts >= job.max_attempts:
        job.status = JobStatus.DEAD.value
    else:
        base = get_settings().job_retry_base_seconds
        delay = base * (2 ** (job.attempts - 1))
        delay += random.randint(0, max(1, delay // 4))  # Jitter
        job.status = JobStatus.FAILED.value
        job.run_at = utcnow() + timedelta(seconds=delay)
    db.commit()


def retry_now(db: Session, job: Job) -> None:
    """Manueller Retry aus dem Adminbereich (auch für DEAD-Jobs)."""
    job.status = JobStatus.QUEUED.value
    job.attempts = 0
    job.run_at = utcnow()
    job.last_error = None
    db.commit()
