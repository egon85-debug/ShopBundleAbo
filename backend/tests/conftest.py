"""Test-Setup: SQLite in-memory, Test-Doubles an den Provider-Interfaces.
Externe Dienste werden nie aufgerufen — die Interfaces sind der Vertrag."""
import io
import os
import tempfile
from decimal import Decimal

# Umgebung VOR App-Importen setzen (get_settings ist gecacht).
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("CREDENTIALS_KEY", "2eYCVOFbYzMHZoVXMy5spPZEbGr2wUOOXG_1Cu0hkkA=")
os.environ.setdefault("STORAGE_LOCAL_PATH", tempfile.mkdtemp(prefix="wf-storage-"))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("VOICE_RETENTION_HOURS", "0")
os.environ.setdefault("RECOGNITION_DELAY_SECONDS", "0")
# Keine echten Anfragen an Open Food Facts & Co. aus den Tests.
os.environ.setdefault("PRODUKTDATENBANKEN", "false")
# Rate Limits würden sonst über die Testsuite hinweg greifen (gleiche Client-IP).
os.environ.setdefault("RATE_LIMIT_AUTH_PER_MINUTE", "100000")
os.environ.setdefault("RATE_LIMIT_UPLOAD_PER_MINUTE", "100000")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app import db as app_db
from app.main import app
from app.models import Base, Role, Tenant
from app.providers import registry
from app.providers.base import (
    ImageOptimizer,
    LlmExtractor,
    ObjectStorage,
    OptimizedImage,
    ProductResearchProvider,
    SpeechToTextProvider,
    VisionProvider,
)
from app.schemas.ai import (
    PriceOffer,
    ResearchCandidate,
    ShopTextGeneration,
    VisionAnalysis,
    VoiceExtraction,
)
from app.services import auth_service
from app.tenancy import mandant_setzen


# ── Test-Doubles ─────────────────────────────────────────────────────────────

class FakeVision(VisionProvider):
    name = "fake-vision"
    result = VisionAnalysis(
        manufacturer="Bosch", brand="Bosch Professional",
        product_name="Bosch Professional GSR 12V-35", model="GSR 12V-35",
        ean="4059952529776", category="Elektrowerkzeug", subcategory="Akkuschrauber",
        color="Blau",
        confidence={"manufacturer": 0.97, "product_name": 0.93, "model": 0.9,
                    "ean": 0.99, "category": 0.95, "color": 0.71},
    )

    def analyze_product_image(self, image_bytes, content_type):
        return self.result


class FakeStt(SpeechToTextProvider):
    name = "fake-stt"

    def transcribe(self, audio_bytes, content_type, language="de"):
        return ("Davon haben wir 14 Stück. Einkaufspreis war 28 Euro 50 netto. "
                "Lieferant Müller Großhandel. Neu und originalverpackt. "
                "Lagerplatz Halle zwei Regal B vier. Verkaufen für 59 Euro.")


class FakeLlm(LlmExtractor):
    name = "fake-llm"
    extraction = VoiceExtraction(
        stock=14, purchase_price_net="28.50", sale_price="59.00",
        supplier_name="Müller Großhandel", condition="new",
        packaging_condition="originalverpackt",
        storage_location_spoken="Halle 2 Regal B4",
        confidence={"stock": 0.97, "purchase_price_net": 0.95, "sale_price": 0.94,
                    "supplier_name": 0.9, "condition": 0.92,
                    "storage_location_spoken": 0.9},
    )

    def extract_voice_data(self, transcript):
        return self.extraction

    def generate_shop_text(self, verified_fields, unverified_fields):
        # Vertragstest: Unverifiziertes darf nicht als Fakt in den Text.
        assert "verified-only" not in unverified_fields
        return ShopTextGeneration(
            seo_title="Bosch Professional GSR 12V-35 Akkuschrauber",
            short_description="Kompakter Profi-Akkuschrauber von Bosch.",
            long_description="<p>Bosch Professional GSR 12V-35 – neu und originalverpackt.</p>",
            bullet_points=["12-V-Klasse", "Neu & OVP"],
            meta_title="Bosch GSR 12V-35 kaufen",
            meta_description="Bosch Professional GSR 12V-35, neu und originalverpackt.",
            url_slug="bosch-professional-gsr-12v-35",
            tags=["bosch", "akkuschrauber"],
            category="Elektrowerkzeug",
        )


class FakeResearch(ProductResearchProvider):
    name = "fake-research"
    candidates: list[ResearchCandidate] = [ResearchCandidate(
        product_name="Bosch Professional GSR 12V-35",
        manufacturer="Bosch", brand="Bosch Professional", ean="4059952529776",
        mpn="06019H8000", category="Elektrowerkzeug", match_score=0.95,
        description="Kompakter 12-V-Akkuschrauber für den professionellen Einsatz.",
    )]
    offers: list[PriceOffer] = [
        PriceOffer(title="Angebot A", price=Decimal("59.90"), condition="new",
                   source_name="shop-a.example"),
        PriceOffer(title="Angebot B", price=Decimal("64.50"), condition="new",
                   source_name="shop-b.example"),
        PriceOffer(title="Angebot C", price=Decimal("61.00"), condition="new",
                   source_name="shop-c.example"),
        PriceOffer(title="10er-Pack", price=Decimal("499.00"), condition="new",
                   pack_size=10, source_name="bulk.example"),
        PriceOffer(title="Gebraucht", price=Decimal("35.00"), condition="used",
                   source_name="used.example"),
    ]

    def identify_product(self, *, ean, mpn, query):
        return self.candidates

    def find_offers(self, *, ean, query, condition):
        return self.offers


class FakeOptimizer(ImageOptimizer):
    name = "fake-optimizer"

    def optimize(self, image_bytes, *, preserve_condition=False):
        return OptimizedImage(data=b"optimized-jpeg", content_type="image/jpeg",
                              width=1600, height=1600)


# ── Fixtures ─────────────────────────────────────────────────────────────────

# Mandant, in dem die Tests arbeiten. Weitere Mandanten legt `neuer_mandant` an.
TEST_MANDANT = "10000000-0000-4000-8000-000000000001"


def neuer_mandant(db, *, tenant_id=None, kurzname="test", name="Testfirma",
                  sku_praefix="WL") -> Tenant:
    tenant = Tenant(id=tenant_id, name=name, kurzname=kurzname, sku_praefix=sku_praefix,
                    status="aktiv")
    db.add(tenant)
    db.commit()
    return tenant


@pytest.fixture()
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    app_db.set_engine(engine)
    with app_db.get_sessionmaker()() as session:
        neuer_mandant(session, tenant_id=TEST_MANDANT)
    yield engine
    engine.dispose()


def sitzung(tenant_id=TEST_MANDANT):
    """Neue Datenbank-Sitzung für einen Mandanten (wie eine Anfrage sie hätte)."""
    session = app_db.get_sessionmaker()()
    mandant_setzen(session, tenant_id)
    return session


@pytest.fixture()
def db(engine):
    session = sitzung()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def providers():
    registry.set_override(VisionProvider, FakeVision())
    registry.set_override(SpeechToTextProvider, FakeStt())
    registry.set_override(LlmExtractor, FakeLlm())
    registry.set_override(ProductResearchProvider, FakeResearch())
    registry.set_override(ImageOptimizer, FakeOptimizer())
    yield
    registry.clear_overrides()


@pytest.fixture()
def preise_automatisch(monkeypatch):
    """Preisrecherche gleich nach der Produktrecherche (sonst nur per Knopf)."""
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "preisrecherche_automatisch", True)


@pytest.fixture()
def client(engine):
    with TestClient(app) as test_client:
        yield test_client


def make_user(db, *, email="worker@example.com", role=Role.EMPLOYEE.value,
              password="test-passwort-123"):
    user = auth_service.create_user(db, email=email, password=password,
                                    display_name="Testbenutzer", role=role)
    db.commit()
    return user


def auth_headers(client, email="worker@example.com", password="test-passwort-123"):
    response = client.post("/api/v1/auth/login",
                           json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def employee(db):
    return make_user(db)


@pytest.fixture()
def admin(db):
    return make_user(db, email="admin@example.com", role=Role.ADMIN.value)


def jpeg_bytes(size=(64, 64), color=(120, 130, 140)) -> bytes:
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def run_all_jobs(max_iterations=50) -> int:
    """Arbeitet die Job-Queue ab (wie der Worker-Prozess)."""
    from app.jobs.worker import Worker
    worker = Worker("test-worker")
    processed = 0
    for _ in range(max_iterations):
        if not worker.process_one():
            break
        processed += 1
    return processed
