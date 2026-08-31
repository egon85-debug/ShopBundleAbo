"""Background-Worker: eigener Prozess (`python -m app.jobs.worker`).
Mehrere Worker sind möglich — Claims sind über FOR UPDATE SKIP LOCKED exklusiv."""
import logging
import os
import signal
import socket
import threading
import time

from app.db import get_sessionmaker
from app.jobs import queue
from app.jobs.handlers import HANDLERS

log = logging.getLogger("winterfeld.worker")

POLL_INTERVAL_SECONDS = 2.0


class Worker:
    def __init__(self, worker_id: str | None = None) -> None:
        self.worker_id = worker_id or f"{socket.gethostname()}-{os.getpid()}"
        self._running = True

    def stop(self, *_args) -> None:
        self._running = False

    def process_one(self) -> bool:
        """Verarbeitet höchstens einen Job. True, wenn einer verarbeitet wurde."""
        session = get_sessionmaker()()
        try:
            job = queue.claim_next(session, self.worker_id)
            if job is None:
                return False
            handler = HANDLERS.get(job.job_type)
            if handler is None:
                queue.mark_failed(session, job, f"Kein Handler für {job.job_type}")
                return True
            log.info("Job %s (%s) Versuch %d/%d", job.id, job.job_type, job.attempts, job.max_attempts)
            try:
                handler(session, job)
                queue.mark_done(session, job)
            except Exception as exc:  # Fehler → Retry mit Backoff, nie Datenverlust
                session.rollback()
                log.exception("Job %s fehlgeschlagen", job.id)
                queue.mark_failed(session, job, f"{type(exc).__name__}: {exc}")
            return True
        finally:
            session.close()

    def run_forever(self) -> None:
        log.info("Worker %s gestartet", self.worker_id)
        # Signalbehandlung geht nur im Hauptthread. Laeuft der Worker im
        # API-Prozess mit (RUN_WORKER_IN_PROCESS), beendet ihn stattdessen die
        # Lifespan-Abschaltung ueber stop().
        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, self.stop)
            signal.signal(signal.SIGINT, self.stop)
        while self._running:
            worked = self.process_one()
            if not worked:
                time.sleep(POLL_INTERVAL_SECONDS)
        log.info("Worker %s beendet", self.worker_id)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
    )
    Worker().run_forever()


if __name__ == "__main__":
    main()
