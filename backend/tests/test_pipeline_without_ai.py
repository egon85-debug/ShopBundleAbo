"""Aufnahme ohne eingerichtete KI-Anbieter.

Fehlt ein API-Schluessel, darf ein erfasster Artikel nicht in der Verarbeitung
haengen bleiben: die Bilder werden trotzdem optimiert, das Gesagte bleibt
erhalten, und der Artikel landet zur Pruefung, wo die Angaben von Hand kommen.
Das ist der Zustand eines frisch aufgesetzten Servers.
"""
from app.jobs import handlers as handlers_modul
from app.jobs import queue
from app.jobs.worker import Worker
from app.models import Job, JobStatus
from app.providers import registry
from app.providers.base import (
    LlmExtractor,
    ProductResearchProvider,
    ProviderNotConfigured,
    SpeechToTextProvider,
    VisionProvider,
)

from tests.conftest import auth_headers, jpeg_bytes, run_all_jobs


class _OhneVision(VisionProvider):
    name = "ohne-vision"
    def analyze_product_image(self, image_bytes, content_type):
        raise ProviderNotConfigured("ANTHROPIC_API_KEY ist nicht gesetzt")


class _OhneLlm(LlmExtractor):
    name = "ohne-llm"
    def extract_voice_data(self, transcript):
        raise ProviderNotConfigured("ANTHROPIC_API_KEY ist nicht gesetzt")
    def generate_shop_text(self, verified, unverified):
        raise ProviderNotConfigured("ANTHROPIC_API_KEY ist nicht gesetzt")


class _OhneRecherche(ProductResearchProvider):
    name = "ohne-recherche"
    def identify_product(self, *, ean, mpn, query):
        raise ProviderNotConfigured("PRICE_RESEARCH_API_BASE ist nicht gesetzt")
    def find_offers(self, *, ean, query, condition):
        raise ProviderNotConfigured("PRICE_RESEARCH_API_BASE ist nicht gesetzt")


class _OhneStt(SpeechToTextProvider):
    name = "ohne-stt"
    def transcribe(self, audio_bytes, content_type, language="de"):
        raise ProviderNotConfigured("STT_API_KEY ist nicht gesetzt")


def _ohne_ki():
    registry.set_override(VisionProvider, _OhneVision())
    registry.set_override(LlmExtractor, _OhneLlm())
    registry.set_override(ProductResearchProvider, _OhneRecherche())
    registry.set_override(SpeechToTextProvider, _OhneStt())


def _erfassen(client, headers, capture_id="cap-ohne-ki-1", mit_sprache=True):
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": capture_id}).json()
    upload = client.post(
        f"/api/v1/captures/{capture['id']}/images", headers=headers,
        files={"file": ("front.jpg", jpeg_bytes(), "image/jpeg")},
        data={"role": "front", "client_image_id": f"{capture_id}-img"},
    )
    assert upload.status_code == 200, upload.text
    if mit_sprache:
        voice = client.post(
            f"/api/v1/captures/{capture['id']}/voice", headers=headers,
            data={"transcript": "Zwölf Stück, Lagerplatz Halle zwei Regal B vier."},
        )
        assert voice.status_code == 200, voice.text
    run_all_jobs()
    return client.get(f"/api/v1/captures/{capture['id']}", headers=headers).json()


class TestOhneKi:
    def test_artikel_landet_zur_pruefung_statt_zu_haengen(self, client, db, employee):
        _ohne_ki()
        state = _erfassen(client, auth_headers(client))

        assert state["processing_status"] == "review_required"
        # Kein Auftrag ist tot oder wartet auf einen sinnlosen Wiederholversuch.
        offen = db.query(Job).filter(Job.status.in_(
            [JobStatus.DEAD.value, JobStatus.FAILED.value])).all()
        assert offen == [], [(j.job_type, j.last_error) for j in offen]

    def test_bilder_werden_trotzdem_optimiert(self, client, employee):
        _ohne_ki()
        state = _erfassen(client, auth_headers(client), mit_sprache=False)

        optimiert = [i for i in state["images"] if i["kind"] == "optimized"]
        assert len(optimiert) == 1
        assert optimiert[0]["is_primary"] is True
        # Das Original bleibt unangetastet daneben.
        assert any(i["kind"] == "original" for i in state["images"])

    def test_gesagtes_bleibt_am_artikel(self, client, employee):
        _ohne_ki()
        state = _erfassen(client, auth_headers(client))
        assert "Halle zwei Regal B vier" in state["voice_transcript"]

    def test_rueckfrage_nach_dem_namen(self, client, employee):
        _ohne_ki()
        state = _erfassen(client, auth_headers(client), mit_sprache=False)
        felder = [q["field"] for q in state["open_questions"]]
        assert "product_name" in felder

    def test_mit_ki_keine_namensrueckfrage(self, client, employee):
        # Gegenprobe mit den ueblichen Test-Doubles: der Name wird erkannt.
        state = _erfassen(client, auth_headers(client), capture_id="cap-mit-ki")
        assert state["product_name"]
        assert "product_name" not in [q["field"] for q in state["open_questions"]]


class TestWorker:
    def test_fehlende_einrichtung_wird_nicht_wiederholt(self, db, monkeypatch):
        """Ein Handler, der ProviderNotConfigured nicht selbst abfaengt, landet
        sofort im Fehlerzustand — nicht fuenfmal mit wachsendem Abstand."""
        def handler(session, job):
            raise ProviderNotConfigured("S3_ACCESS_KEY / S3_SECRET_KEY sind nicht gesetzt")

        monkeypatch.setitem(handlers_modul.HANDLERS, "test_ohne_einrichtung", handler)
        monkeypatch.setattr("app.jobs.worker.HANDLERS", handlers_modul.HANDLERS)
        queue.enqueue(db, job_type="test_ohne_einrichtung", payload={})
        db.commit()

        assert Worker("w-test").process_one() is True
        db.expire_all()
        job = db.query(Job).filter(Job.job_type == "test_ohne_einrichtung").one()
        assert job.status == JobStatus.DEAD.value
        assert job.attempts == job.max_attempts
        assert "Nicht eingerichtet" in job.last_error
        assert "S3_ACCESS_KEY" in job.last_error
