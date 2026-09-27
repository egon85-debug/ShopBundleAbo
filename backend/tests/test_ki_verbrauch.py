"""KI-Verbrauch: Messen, Kosten, Wiederverwendung und keine doppelten Läufe."""
from decimal import Decimal
from types import SimpleNamespace

from app.models import AiRun, Product
from app.providers import registry
from app.providers.base import LlmExtractor, ProductResearchProvider
from app.services import ki_verbrauch

from tests.conftest import FakeLlm, FakeResearch, auth_headers, jpeg_bytes, run_all_jobs


def _antwort(modell="claude-opus-5", ein=1000, aus=500, suchen=0, lesen=0):
    return SimpleNamespace(model=modell, usage=SimpleNamespace(
        input_tokens=ein, output_tokens=aus, cache_read_input_tokens=lesen,
        cache_creation_input_tokens=0,
        server_tool_use=SimpleNamespace(web_search_requests=suchen)))


class TestKosten:
    def test_opus5_mit_websuche(self):
        with ki_verbrauch.messen() as liste:
            ki_verbrauch.erfassen(_antwort(ein=30000, aus=3000, suchen=3), "claude-opus-5")
        werte = ki_verbrauch.summe(liste)
        # 30.000 × 5 $ + 3.000 × 25 $ je Mio. + 3 × 1 Cent
        assert werte["cost_usd"] == Decimal("0.255000")
        assert werte["web_searches"] == 3 and werte["api_calls"] == 1

    def test_mehrere_runden_und_cache(self):
        with ki_verbrauch.messen() as liste:
            ki_verbrauch.erfassen(_antwort(ein=1000, aus=0), "claude-opus-5")
            ki_verbrauch.erfassen(_antwort(ein=0, aus=0, lesen=10000), "claude-opus-5")
        assert ki_verbrauch.summe(liste)["cost_usd"] == Decimal("0.010000")

    def test_ausweichmodell_zaehlt_mit_eigenem_preis(self):
        with ki_verbrauch.messen() as liste:
            ki_verbrauch.erfassen(_antwort(modell="claude-opus-4-8", ein=1_000_000, aus=0),
                                  "claude-opus-5")
        assert ki_verbrauch.summe(liste)["model"] == "claude-opus-4-8"

    def test_unbekanntes_modell_speichert_tokens_ohne_kosten(self):
        with ki_verbrauch.messen() as liste:
            ki_verbrauch.erfassen(_antwort(modell="claude-neu-9"), "claude-neu-9")
        werte = ki_verbrauch.summe(liste)
        assert werte["cost_usd"] is None and werte["input_tokens"] == 1000

    def test_ohne_messen_passiert_nichts(self):
        ki_verbrauch.erfassen(_antwort(), "claude-opus-5")  # darf nicht werfen


class _ZaehlendeRecherche(FakeResearch):
    def __init__(self):
        self.suchen = 0
        self.preise = 0

    def identify_product(self, *, ean, mpn, query):
        self.suchen += 1
        ki_verbrauch.erfassen(_antwort(ein=30000, aus=3000, suchen=3), "claude-opus-5")
        return self.candidates

    def find_offers(self, *, ean, query, condition):
        self.preise += 1
        ki_verbrauch.erfassen(_antwort(ein=20000, aus=2000, suchen=2), "claude-opus-5")
        return self.offers


class _ZaehlenderText(FakeLlm):
    def __init__(self):
        self.texte = 0

    def generate_shop_text(self, verified_fields, unverified_fields):
        self.texte += 1
        return super().generate_shop_text(verified_fields, unverified_fields)


def _artikel(client, headers, nr):
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": f"kosten-{nr}"}).json()
    res = client.post(f"/api/v1/captures/{capture['id']}/images", headers=headers,
                      files={"file": ("f.jpg", jpeg_bytes(), "image/jpeg")},
                      data={"role": "front", "client_image_id": f"kosten-{nr}-1"})
    assert res.status_code == 200, res.text
    run_all_jobs()
    return capture["id"]


def test_verbrauch_landet_am_artikel_und_gleiche_ean_wird_wiederverwendet(client, db, employee):
    recherche, text = _ZaehlendeRecherche(), _ZaehlenderText()
    registry.set_override(ProductResearchProvider, recherche)
    registry.set_override(LlmExtractor, text)
    headers = auth_headers(client)

    erster = _artikel(client, headers, 1)
    laeufe = {r.kind: r for r in db.query(AiRun).filter(AiRun.product_id == erster)}
    assert laeufe["product_research"].cost_usd == Decimal("0.255000")
    assert laeufe["product_research"].web_searches == 3
    assert laeufe["price_research"].cost_usd == Decimal("0.170000")
    # Shoptext genau einmal – nach der Recherche, nicht zusätzlich davor
    assert text.texte == 1

    zweiter = _artikel(client, headers, 2)  # gleiche EAN (FakeVision)
    assert recherche.suchen == 1 and recherche.preise == 1
    wieder = {r.kind: r for r in db.query(AiRun).filter(AiRun.product_id == zweiter)}
    assert wieder["product_research"].provider == "wiederverwendet"
    assert wieder["product_research"].cost_usd is None
    assert db.get(Product, zweiter).recommended_sale_price is not None


def test_marktpreise_aktualisieren_sucht_frisch(client, db, employee, admin):
    recherche = _ZaehlendeRecherche()
    registry.set_override(ProductResearchProvider, recherche)
    headers = auth_headers(client)
    produkt = _artikel(client, headers, 3)
    admin_headers = auth_headers(client, email="admin@example.com")
    res = client.post(f"/api/v1/products/{produkt}/reprice", headers=admin_headers)
    assert res.status_code == 202, res.text
    run_all_jobs()
    assert recherche.preise == 2


def test_kosten_je_artikel_und_uebersicht_ueber_die_api(client, db, employee):
    registry.set_override(ProductResearchProvider, _ZaehlendeRecherche())
    headers = auth_headers(client)
    produkt = _artikel(client, headers, 4)

    je_artikel = client.get(f"/api/v1/products/{produkt}/ki-kosten", headers=headers).json()
    assert je_artikel["summe_usd"] == "0.4250"  # 0,255 + 0,17
    arten = {l["kind"] for l in je_artikel["laeufe"]}
    assert {"product_research", "price_research", "vision", "shoptext"} <= arten

    uebersicht = client.get("/api/v1/ki-kosten?tage=30", headers=headers).json()
    assert uebersicht["zeitraum"]["gesamt_usd"] == "0.4250"
    assert uebersicht["zeitraum"]["artikel"] == 1
    assert uebersicht["zeitraum"]["nach_zweck"]["product_research"]["usd"] == "0.2550"
    assert uebersicht["zeitraum"]["websuchen"] == 5
