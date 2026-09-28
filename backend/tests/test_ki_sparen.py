"""KI-Kosten sparen: Denktiefe, keine doppelte Bilderkennung, kein Hängenbleiben,
Budget-Freigabe von Hand."""
from decimal import Decimal
from types import SimpleNamespace

from app.models import AiRun, Job, Product
from app.providers import anthropic_provider, registry
from app.providers.base import LlmExtractor, ProductResearchProvider, VisionProvider
from app.services import ki_verbrauch

from tests.conftest import FakeLlm, FakeResearch, FakeVision, auth_headers, jpeg_bytes, run_all_jobs


def _antwort(modell="claude-sonnet-5", ein=1000, aus=500, suchen=0):
    return SimpleNamespace(model=modell, usage=SimpleNamespace(
        input_tokens=ein, output_tokens=aus, cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
        server_tool_use=SimpleNamespace(web_search_requests=suchen)))


# ── Denktiefe ────────────────────────────────────────────────────────────────

class _Aufzeichner:
    """Ersetzt den SDK-Client und merkt sich die Anfragen."""

    def __init__(self):
        self.anfragen = []
        self.messages = self

    def create(self, **request):
        self.anfragen.append(request)
        return SimpleNamespace(stop_reason="end_turn", model=request["model"],
                               content=[SimpleNamespace(type="text", text='{"ok": true}')],
                               usage=_antwort().usage)


_ECHTER_CLIENT = anthropic_provider.AnthropicClient


def _client(aufzeichner, modell=None) -> anthropic_provider.AnthropicClient:
    client = object.__new__(_ECHTER_CLIENT)
    client.model = modell or "claude-sonnet-5"
    client._client = aufzeichner
    return client


def test_denktiefe_wird_mitgeschickt():
    aufzeichner = _Aufzeichner()
    client = _client(aufzeichner)
    client.complete([{"type": "text", "text": "hallo"}])
    client.complete([{"type": "text", "text": "hallo"}], effort="medium")
    # Ohne Angabe denkt Sonnet 5 auf „high“ – das war der größte Kostenblock.
    assert aufzeichner.anfragen[0]["output_config"] == {"effort": "low"}
    assert aufzeichner.anfragen[1]["output_config"] == {"effort": "medium"}


def test_haiku_bekommt_keine_denktiefe():
    # Haiku 4.5 kennt effort nicht (die API lehnte die Anfrage ab) und denkt
    # ohne thinking-Angabe ohnehin nicht vorab.
    aufzeichner = _Aufzeichner()
    _client(aufzeichner, "claude-haiku-4-5").complete([{"type": "text", "text": "hallo"}],
                                                     effort="medium")
    assert "output_config" not in aufzeichner.anfragen[0]


def _recherche(monkeypatch, aufzeichner):
    monkeypatch.setattr(anthropic_provider, "AnthropicClient",
                        lambda modell=None: _client(aufzeichner, modell))
    monkeypatch.setattr(anthropic_provider, "_parse_json_block", lambda raw: {"items": []})
    anthropic_provider.AnthropicWebResearchProvider().identify_product(
        ean="4006381333931", mpn=None, query="Faltkarton")
    return aufzeichner.anfragen[-1]


def test_recherche_und_texte_laufen_mit_haiku(monkeypatch):
    anfrage = _recherche(monkeypatch, _Aufzeichner())
    assert anfrage["model"] == "claude-haiku-4-5"
    assert "output_config" not in anfrage
    # Haiku kennt nur die Grundversion der Websuche.
    assert {t["type"] for t in anfrage["tools"]} == {"web_search_20250305", "web_fetch_20250910"}

    aufzeichner = _Aufzeichner()
    monkeypatch.setattr(anthropic_provider, "AnthropicClient",
                        lambda modell=None: _client(aufzeichner, modell))
    monkeypatch.setattr(anthropic_provider, "_parse_json_block", lambda raw: {})
    try:
        anthropic_provider.AnthropicLlmExtractor().extract_voice_data("Lagerplatz A 1")
    except Exception:
        pass  # leere Antwort – hier zählt nur das Modell der Anfrage
    assert aufzeichner.anfragen[-1]["model"] == "claude-haiku-4-5"


def test_recherche_mit_hauptmodell_denkt_mittel(monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "ki_modell_recherche", "")
    anfrage = _recherche(monkeypatch, _Aufzeichner())
    assert anfrage["model"] == "claude-sonnet-5"
    assert anfrage["output_config"] == {"effort": "medium"}
    assert any(t["name"] == "web_search" for t in anfrage["tools"])


# ── Bilderkennung nur so oft wie nötig ───────────────────────────────────────

class _ZaehlendeErkennung(FakeVision):
    def __init__(self, ergebnis=None):
        self.laeufe = 0
        if ergebnis is not None:
            self.result = ergebnis

    def analyze_product_images(self, images):
        self.laeufe += 1
        return self.result


def _foto(client, headers, capture_id, nr, rolle):
    res = client.post(f"/api/v1/captures/{capture_id}/images", headers=headers,
                      files={"file": ("f.jpg", jpeg_bytes(), "image/jpeg")},
                      data={"role": rolle, "client_image_id": f"{capture_id}-{nr}"})
    assert res.status_code == 200, res.text


def _aufnahme(client, headers, name):
    return client.post("/api/v1/captures", headers=headers,
                       json={"client_capture_id": name}).json()["id"]


def test_weitere_fotos_nach_der_erkennung_loesen_keine_neue_aus(client, db, employee):
    erkennung = _ZaehlendeErkennung()
    registry.set_override(VisionProvider, erkennung)
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-1")

    _foto(client, headers, produkt, 1, "front")
    run_all_jobs()
    for nr, rolle in enumerate(["back", "type_plate", "packaging"], start=2):
        _foto(client, headers, produkt, nr, rolle)
        run_all_jobs()

    # Der Artikel war nach dem ersten Foto erkannt (Name + EAN): eine Erkennung.
    assert erkennung.laeufe == 1
    artikel = db.get(Product, produkt)
    assert artikel.processing_status == "review_required"
    # Die neuen Fotos wurden trotzdem für den Shop aufbereitet.
    assert len([i for i in artikel.images if i.kind == "optimized"]) == 4


def test_hoechstens_zwei_erkennungen_wenn_nichts_erkannt_wird(client, db, employee):
    from app.schemas.ai import VisionAnalysis
    erkennung = _ZaehlendeErkennung(VisionAnalysis(category="Verpackung", confidence={}))
    registry.set_override(VisionProvider, erkennung)
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-2")
    for nr, rolle in enumerate(["front", "back", "type_plate", "barcode"], start=1):
        _foto(client, headers, produkt, nr, rolle)
        run_all_jobs()
    assert erkennung.laeufe == 2
    assert db.get(Product, produkt).processing_status == "review_required"


def test_erneute_erkennung_ohne_folgeschritt_bleibt_nicht_haengen(client, db, employee):
    """Der gemeldete Fall: zweite Erkennung, Recherche und Shoptext schon da →
    früher blieb der Artikel für immer auf „product_identified“ stehen."""
    from app.schemas.ai import VisionAnalysis
    ohne_ean = VisionAnalysis(product_name="Coca-Cola Original Taste 6 × 1,0 l",
                              manufacturer="Coca-Cola", confidence={"product_name": 0.9})
    registry.set_override(VisionProvider, _ZaehlendeErkennung(ohne_ean))
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-3")
    _foto(client, headers, produkt, 1, "front")
    run_all_jobs()
    _foto(client, headers, produkt, 2, "back")
    run_all_jobs()
    assert db.get(Product, produkt).processing_status == "review_required"


def test_bildoptimierung_als_letzter_schritt_laesst_den_status_stehen(client, db, employee):
    from app.jobs import queue
    from app.models.job import JobType
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-4")
    _foto(client, headers, produkt, 1, "front")
    run_all_jobs()
    assert db.get(Product, produkt).processing_status == "review_required"
    queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                  payload={"product_id": produkt}, product_id=produkt)
    db.commit()
    run_all_jobs()
    db.expire_all()
    assert db.get(Product, produkt).processing_status == "review_required"


# ── Budget von Hand freigeben ────────────────────────────────────────────────

class _TeureRecherche(FakeResearch):
    def __init__(self):
        self.suchen = 0
        self.preise = 0

    def identify_product(self, *, ean, mpn, query):
        self.suchen += 1
        ki_verbrauch.erfassen(_antwort(ein=100000, aus=8000, suchen=2), "claude-sonnet-5")
        return self.candidates  # 0,30 $

    def find_offers(self, *, ean, query, condition):
        self.preise += 1
        ki_verbrauch.erfassen(_antwort(ein=15000, aus=1500, suchen=2), "claude-sonnet-5")
        return self.offers


class _ZaehlenderText(FakeLlm):
    def __init__(self):
        self.texte = 0

    def generate_shop_text(self, verified_fields, unverified_fields):
        self.texte += 1
        return super().generate_shop_text(verified_fields, unverified_fields)


def test_freigabe_setzt_die_ausgelassenen_schritte_fort(client, db, employee, admin,
                                                        preise_automatisch):
    recherche, text = _TeureRecherche(), _ZaehlenderText()
    registry.set_override(ProductResearchProvider, recherche)
    registry.set_override(LlmExtractor, text)
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-5")
    _foto(client, headers, produkt, 1, "front")
    run_all_jobs()
    assert recherche.preise == 0 and text.texte == 0  # Bremse hat gegriffen

    vorher = client.get(f"/api/v1/products/{produkt}/ki-kosten", headers=headers).json()
    assert vorher["gebremst"] is True

    # Mitarbeitende dürfen nicht freigeben, Leitung und Admin schon.
    verboten = client.post(f"/api/v1/products/{produkt}/ki-budget-freigeben", headers=headers)
    assert verboten.status_code == 403
    admin_headers = auth_headers(client, email="admin@example.com")
    res = client.post(f"/api/v1/products/{produkt}/ki-budget-freigeben", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json()["budget_usd"] == "0.7000"
    run_all_jobs()

    assert recherche.preise == 1 and text.texte == 1
    assert recherche.suchen == 1  # die Produktrecherche lief nicht doppelt
    nachher = client.get(f"/api/v1/products/{produkt}/ki-kosten", headers=headers).json()
    assert nachher["gebremst"] is False
    assert Decimal(nachher["summe_usd"]) <= Decimal("0.70")
    freigabe = [l for l in nachher["laeufe"] if l["kind"] == "budget_freigabe"]
    assert len(freigabe) == 1 and freigabe[0]["cost_usd"] is None
    assert db.get(Product, produkt).processing_status == "review_required"
    # Die Monatsübersicht zählt die Freigabe nicht als Kosten.
    uebersicht = client.get("/api/v1/ki-kosten?tage=30", headers=headers).json()
    assert "budget_freigabe" not in uebersicht["zeitraum"]["nach_zweck"]


def test_ohne_ausgelassene_schritte_kein_freigabe_knopf(client, db, employee):
    headers = auth_headers(client)
    produkt = _aufnahme(client, headers, "sparen-6")
    _foto(client, headers, produkt, 1, "front")
    run_all_jobs()
    kosten = client.get(f"/api/v1/products/{produkt}/ki-kosten", headers=headers).json()
    assert kosten["gebremst"] is False
    assert not db.query(Job).filter(Job.product_id == produkt, Job.status == "failed").count()
    assert not db.query(AiRun).filter(AiRun.product_id == produkt, AiRun.status == "budget").count()
