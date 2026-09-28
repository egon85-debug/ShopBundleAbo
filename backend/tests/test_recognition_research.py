"""Erkennung mit allen Fotos einer Aufnahme und automatische Uebernahme der Recherche."""
from app.models import AiRun, Job, JobType
from app.providers import registry
from app.providers.base import VisionProvider
from app.schemas.ai import ResearchCandidate
from app.jobs.handlers import _eindeutiger_treffer

from tests.conftest import FakeVision, auth_headers, jpeg_bytes, run_all_jobs


class _MerkendeVision(FakeVision):
    def __init__(self):
        self.aufrufe: list[list[str]] = []

    def analyze_product_images(self, images):
        self.aufrufe.append([i.role for i in images])
        return self.result


def _foto(client, headers, capture_id, rolle, nr):
    res = client.post(f"/api/v1/captures/{capture_id}/images", headers=headers,
                      files={"file": (f"{rolle}.jpg", jpeg_bytes(), "image/jpeg")},
                      data={"role": rolle, "client_image_id": f"{capture_id}-{nr}"})
    assert res.status_code == 200, res.text


def test_alle_fotos_gehen_gemeinsam_in_die_erkennung(client, db, employee):
    vision = _MerkendeVision()
    registry.set_override(VisionProvider, vision)
    headers = auth_headers(client)
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": "mehrbild"}).json()
    _foto(client, headers, capture["id"], "front", 1)
    _foto(client, headers, capture["id"], "barcode", 2)
    _foto(client, headers, capture["id"], "damage", 3)
    _foto(client, headers, capture["id"], "type_plate", 4)
    # Die Fotos kamen, bevor die Erkennung lief → nur ein Auftrag
    assert db.query(Job).filter(Job.job_type == JobType.RECOGNIZE_PRODUCT.value).count() == 1

    run_all_jobs()
    # Wichtigste Ansichten zuerst, Schadensfoto nicht zur Erkennung
    assert vision.aufrufe == [["front", "type_plate", "barcode"]]
    recherchen = db.query(AiRun).filter(AiRun.kind == "product_research").count()
    assert recherchen == 1

    # Ein spaeteres Foto: Der Artikel ist schon erkannt (Name + EAN), also
    # keine neue Erkennung und keine zweite Recherche – beides kostet. Das Foto
    # wird nur fuer den Shop aufbereitet.
    _foto(client, headers, capture["id"], "back", 5)
    run_all_jobs()
    assert len(vision.aufrufe) == 1
    assert db.query(AiRun).filter(AiRun.kind == "product_research").count() == recherchen


def test_recherche_wird_automatisch_eingetragen(client, employee):
    headers = auth_headers(client)
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": "auto-recherche"}).json()
    _foto(client, headers, capture["id"], "front", 1)
    run_all_jobs()
    p = client.get(f"/api/v1/captures/{capture['id']}", headers=headers).json()
    # Aus der Recherche (FakeResearch, match_score 0.95): MPN und Beschreibung
    assert p["mpn"] == "06019H8000"
    assert p["field_sources"]["mpn"] == "research"
    assert "Akkuschrauber" in (p["long_description"] or "")
    assert p["research_candidates"] == []


def _k(score, name="A"):
    return ResearchCandidate(product_name=name, match_score=score)


class TestEindeutigerTreffer:
    def test_sicherer_einzeltreffer(self):
        assert _eindeutiger_treffer([_k(0.9)]).product_name == "A"

    def test_unsicherer_treffer_wird_nachgefragt(self):
        assert _eindeutiger_treffer([_k(0.6)]) is None

    def test_zwei_aehnliche_varianten_werden_nachgefragt(self):
        assert _eindeutiger_treffer([_k(0.9, "Blau"), _k(0.85, "Rot")]) is None

    def test_klar_bester_von_mehreren(self):
        assert _eindeutiger_treffer([_k(0.5, "B"), _k(0.95, "A")]).product_name == "A"

    def test_nichts_gefunden(self):
        assert _eindeutiger_treffer([]) is None
