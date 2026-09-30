"""Sparpaket: offene Produktdatenbanken vor der Websuche, Preisrecherche per Knopf."""
import httpx
import pytest

from app.models import AiRun, Product
from app.providers import produktdatenbanken, registry
from app.providers.base import LlmExtractor, ProductResearchProvider

from tests.conftest import FakeLlm, FakeResearch, auth_headers, jpeg_bytes, run_all_jobs

EAN = "4059952529776"  # die EAN, die FakeVision vom Foto „abliest“


class _ZaehlendeRecherche(FakeResearch):
    def __init__(self):
        self.suchen = 0
        self.preise = 0

    def identify_product(self, *, ean, mpn, query):
        self.suchen += 1
        return super().identify_product(ean=ean, mpn=mpn, query=query)

    def find_offers(self, *, ean, query, condition):
        self.preise += 1
        return super().find_offers(ean=ean, query=query, condition=condition)


@pytest.fixture()
def recherche():
    zaehler = _ZaehlendeRecherche()
    registry.set_override(ProductResearchProvider, zaehler)
    registry.set_override(LlmExtractor, FakeLlm())
    return zaehler


@pytest.fixture()
def datenbanken(monkeypatch):
    """Offene Datenbanken einschalten; Antworten je Datenbank nachstellen."""
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "produktdatenbanken", True)
    antworten: dict[str, dict | None] = {}
    anfragen: list[httpx.Request] = []

    def beantworten(request: httpx.Request) -> httpx.Response:
        anfragen.append(request)
        produkt = antworten.get(request.url.host)
        if produkt is None:
            return httpx.Response(404, json={"status": 0, "status_verbose": "product not found"})
        return httpx.Response(200, json={"status": 1, "product": produkt})

    monkeypatch.setattr(produktdatenbanken, "_transport", httpx.MockTransport(beantworten))
    return antworten, anfragen


def _artikel(client, headers, name="sparpaket-1"):
    produkt = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": name}).json()["id"]
    res = client.post(f"/api/v1/captures/{produkt}/images", headers=headers,
                      files={"file": ("f.jpg", jpeg_bytes(), "image/jpeg")},
                      data={"role": "front", "client_image_id": f"{name}-1"})
    assert res.status_code == 200, res.text
    run_all_jobs()
    return produkt


# ── Nachschlagen ─────────────────────────────────────────────────────────────

def test_nachschlagen_fragt_die_datenbanken_der_reihe_nach(datenbanken):
    antworten, anfragen = datenbanken
    antworten["world.openproductsfacts.org"] = {
        "product_name": "GSR 12V-35", "brands": "Bosch Professional, Bosch",
        "quantity": "1 Stück"}
    treffer = produktdatenbanken.nachschlagen(EAN)
    assert [r.url.host for r in anfragen] == [
        "world.openfoodfacts.org", "world.openbeautyfacts.org",
        "world.openpetfoodfacts.org", "world.openproductsfacts.org"]
    assert anfragen[0].headers["User-Agent"].startswith("WinterfeldtLager/")
    assert treffer.product_name == "GSR 12V-35"
    assert treffer.brand == "Bosch Professional"
    assert treffer.ean == EAN and treffer.match_score >= 0.95
    assert treffer.technical_data == {"Inhalt": "1 Stück"}
    assert treffer.source_url == f"https://world.openproductsfacts.org/product/{EAN}"


def test_deutscher_name_zuerst_und_vorhandener_name_bleibt(datenbanken):
    antworten, _ = datenbanken
    antworten["world.openfoodfacts.org"] = {
        "product_name": "Coca Cola", "product_name_de": "Coca-Cola Original",
        "brands": "Coca-Cola", "quantity": "1 l"}
    assert produktdatenbanken.nachschlagen("5000112637922").product_name == "Coca-Cola Original"
    # Hat der Artikel schon einen Namen (Foto/Eingabe), wird er nicht ersetzt.
    assert produktdatenbanken.nachschlagen("5000112637922", name_bekannt=True).product_name is None


@pytest.mark.parametrize("produkt", [
    {"product_name": "Irgendwas"},          # ohne Marke zu dünn
    {"brands": "Marke"},                    # ohne Namen zu dünn
])
def test_duenne_eintraege_zaehlen_nicht(datenbanken, produkt):
    antworten, _ = datenbanken
    antworten["world.openfoodfacts.org"] = produkt
    assert produktdatenbanken.nachschlagen("5000112637922") is None


def test_test_eintraege_zaehlen_nicht(datenbanken):
    antworten, _ = datenbanken
    antworten["world.openfoodfacts.org"] = {
        "product_name": "Diagnostic Test Product DELETE ME", "brands": "DiagnosticTest"}
    assert produktdatenbanken.nachschlagen("5000112637922") is None


@pytest.mark.parametrize(("erkannt", "passt"), [
    ("CocaCola Original Taste 6 x 1,0 l", True),
    ("Coca-Cola", True),
    ("Bosch Professional GSR 12V-35", False),  # EAN vermutlich falsch abgelesen
    ("", True),                                # nichts erkannt – nicht ablehnen
])
def test_marke_muss_zum_foto_passen(datenbanken, erkannt, passt):
    antworten, _ = datenbanken
    antworten["world.openfoodfacts.org"] = {"product_name": "Coca Cola", "brands": "Coca-Cola"}
    treffer = produktdatenbanken.nachschlagen("5000112637922", erkannt=erkannt)
    assert (treffer is not None) is passt


def test_ungueltige_ean_fragt_gar_nicht_erst(datenbanken):
    _, anfragen = datenbanken
    assert produktdatenbanken.nachschlagen("1234567890123") is None
    assert anfragen == []


def test_nicht_erreichbar_heisst_kein_treffer(monkeypatch):
    def kaputt(request):
        raise httpx.ConnectTimeout("zu langsam", request=request)
    monkeypatch.setattr(produktdatenbanken, "_transport", httpx.MockTransport(kaputt))
    assert produktdatenbanken.nachschlagen(EAN) is None


# ── In der KI-Kette ──────────────────────────────────────────────────────────

def test_treffer_in_der_datenbank_spart_die_websuche(client, db, employee, recherche,
                                                     datenbanken):
    antworten, _ = datenbanken
    antworten["world.openproductsfacts.org"] = {
        "product_name": "GSR 12V-35", "brands": "Bosch Professional", "quantity": "1 Stück"}
    headers = auth_headers(client)
    produkt_id = _artikel(client, headers)

    assert recherche.suchen == 0 and recherche.preise == 0
    lauf = db.query(AiRun).filter(AiRun.product_id == produkt_id,
                                  AiRun.kind == "product_research").one()
    assert lauf.provider == "produktdatenbank" and lauf.cost_usd is None
    produkt = db.get(Product, produkt_id)
    # Name vom Foto bleibt, Angaben aus der Datenbank kommen dazu.
    assert produkt.product_name == "Bosch Professional GSR 12V-35"
    assert produkt.technical_data.get("Inhalt") == "1 Stück"
    assert produkt.processing_status == "review_required"

    kosten = client.get(f"/api/v1/products/{produkt_id}/ki-kosten", headers=headers).json()
    # Der Datenbank-Treffer zählt nicht als „ohne gemessenen Verbrauch“
    # (die übrigen sind die Test-Attrappen für Erkennung und Shoptext).
    attrappen = [l for l in kosten["laeufe"] if l["provider"] != "produktdatenbank"]
    assert kosten["ungemessen"] == len(attrappen)
    uebersicht = client.get("/api/v1/ki-kosten?tage=30", headers=headers).json()
    assert uebersicht["monat"]["produktdatenbank"] == 1
    assert uebersicht["modelle"] == {"erkennung": "claude-sonnet-5",
                                     "recherche": "claude-haiku-4-5",
                                     "text": "claude-haiku-4-5"}


def test_fremde_marke_in_der_datenbank_fuehrt_zur_websuche(client, db, employee, recherche,
                                                          datenbanken):
    antworten, _ = datenbanken
    antworten["world.openfoodfacts.org"] = {"product_name": "Cola", "brands": "Coca-Cola"}
    produkt_id = _artikel(client, auth_headers(client))
    assert recherche.suchen == 1
    assert db.get(Product, produkt_id).brand == "Bosch Professional"


def test_ohne_treffer_sucht_die_ki_wie_bisher(client, db, employee, recherche, datenbanken):
    headers = auth_headers(client)
    _artikel(client, headers)
    assert recherche.suchen == 1


def test_preise_nur_per_knopf(client, db, employee, recherche):
    headers = auth_headers(client)
    produkt_id = _artikel(client, headers)
    assert recherche.suchen == 1 and recherche.preise == 0
    assert db.get(Product, produkt_id).processing_status == "review_required"

    res = client.post(f"/api/v1/products/{produkt_id}/reprice", headers=headers)
    assert res.status_code == 202, res.text
    run_all_jobs()
    assert recherche.preise == 1
    db.expire_all()
    produkt = db.get(Product, produkt_id)
    assert str(produkt.lowest_market_price) == "59.90"
    assert produkt.processing_status == "review_required"


def test_preise_automatisch_wenn_eingestellt(client, db, employee, recherche,
                                             preise_automatisch):
    _artikel(client, auth_headers(client))
    assert recherche.preise == 1
