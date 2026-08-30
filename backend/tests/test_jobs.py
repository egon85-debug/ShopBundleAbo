"""Job-Queue: Claim, Retry mit Backoff, Dead-Letter, kein Datenverlust bei Fehlern."""
from app.jobs import queue
from app.jobs.worker import Worker
from app.models import Job, JobStatus
from app.models.base import utcnow


class TestQueue:
    def test_enqueue_and_claim(self, db, engine):
        queue.enqueue(db, job_type="recognize_product", payload={"x": 1})
        db.commit()
        job = queue.claim_next(db, "w1")
        assert job is not None
        assert job.status == JobStatus.RUNNING.value
        assert job.attempts == 1

    def test_failed_job_gets_backoff_then_dead(self, db, engine):
        job = queue.enqueue(db, job_type="recognize_product")
        job.max_attempts = 2
        db.commit()

        claimed = queue.claim_next(db, "w1")
        queue.mark_failed(db, claimed, "Boom")
        assert claimed.status == JobStatus.FAILED.value
        assert claimed.run_at > utcnow()  # Backoff in der Zukunft
        assert claimed.last_error == "Boom"

        # Zweiter Versuch (Backoff überspringen) → DEAD
        claimed.run_at = utcnow()
        db.commit()
        claimed = queue.claim_next(db, "w1")
        queue.mark_failed(db, claimed, "Boom 2")
        assert claimed.status == JobStatus.DEAD.value

    def test_retry_now_resets(self, db, engine):
        job = queue.enqueue(db, job_type="recognize_product")
        job.status = JobStatus.DEAD.value
        job.attempts = 5
        db.commit()
        queue.retry_now(db, job)
        assert job.status == JobStatus.QUEUED.value
        assert job.attempts == 0


class TestWorker:
    def test_unknown_job_type_fails_gracefully(self, db, engine):
        queue.enqueue(db, job_type="does_not_exist")
        db.commit()
        assert Worker("w-test").process_one() is True
        db.expire_all()
        job = db.query(Job).one()
        assert job.status in (JobStatus.FAILED.value, JobStatus.DEAD.value)
        assert "Kein Handler" in job.last_error

    def test_handler_exception_marks_failed_not_lost(self, db, engine, providers):
        """Provider-Fehler (z. B. fehlender API-Key) → Retry, keine Datenverluste."""
        from app.providers import registry
        from app.providers.base import ProviderNotConfigured, VisionProvider

        class BrokenVision(VisionProvider):
            name = "broken"
            def analyze_product_image(self, image_bytes, content_type):
                raise ProviderNotConfigured("Kein API-Key")

        registry.set_override(VisionProvider, BrokenVision())
        from app.services import product_service
        from tests.conftest import make_user
        user = make_user(db, email="jobs@example.com")
        product = product_service.create_draft(db, client_capture_id="job-err-1",
                                               user=user)
        from app.models import ImageKind, ProductImage
        from app.providers.registry import get_storage
        get_storage().put(f"products/{product.id}/original/x.jpg", b"img", "image/jpeg")
        image = ProductImage(product_id=product.id, kind=ImageKind.ORIGINAL.value,
                             role="front",
                             storage_key=f"products/{product.id}/original/x.jpg")
        db.add(image)
        db.flush()
        queue.enqueue(db, job_type="recognize_product",
                      payload={"product_id": product.id, "image_id": image.id})
        db.commit()

        assert Worker("w-test").process_one() is True
        db.expire_all()
        job = db.query(Job).filter(Job.job_type == "recognize_product").one()
        assert job.status == JobStatus.FAILED.value
        assert "ProviderNotConfigured" in job.last_error
        # Produkt existiert weiter — Artikel wurde nicht verloren.
        assert db.get(type(product), product.id) is not None
