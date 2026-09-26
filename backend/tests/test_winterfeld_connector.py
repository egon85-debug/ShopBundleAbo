"""Connector zum eigenen Shop: geprüft wird der tatsächlich gesendete Aufruf."""
from decimal import Decimal

import httpx
import pytest

from app.connectors.base import ShopConnectorError, ShopListingPayload
from app.connectors.registry import available_connector_types, build_connector
from app.connectors.winterfeld import WinterfeldShopConnector
from app.models.shop import ShopConnection

BASIS = "https://shop.example.de"


@pytest.fixture
def antwort(monkeypatch):
    """Ersetzt den HTTP-Unterbau, sodass der echte Aufruf des Connectors sichtbar wird.

    `trust_env=False` und leere `mounts` schalten den Umgebungs-Proxy ab – sonst
    liefe die Anfrage an der Attrappe vorbei.
    """
    echte_klasse = httpx.Client

    def bauen(handler):
        transport = httpx.MockTransport(handler)

        def fabrik(*args, **kwargs):
            kwargs.update(transport=transport, mounts={}, trust_env=False)
            return echte_klasse(*args, **kwargs)

        monkeypatch.setattr(httpx, "Client", fabrik)
        return WinterfeldShopConnector(BASIS, {"api_key": "k" * 40})

    return bauen


def _listing(**overrides) -> ShopListingPayload:
    daten = dict(
        sku="WL-1001",
        title="Faltkarton 400×300×300",
        short_description="Stabiler Karton",
        long_description="Zweiwellig, FEFCO 0201.",
        price=Decimal("12.90"),
        stock_quantity=42,
        condition="neu",
        category="Kartons",
        ean="4006381333931",
        image_urls=["https://cdn.example.de/1.jpg"],
    )
    daten.update(overrides)
    return ShopListingPayload(**daten)


def test_connector_ist_registriert():
    assert "winterfeld" in available_connector_types()
    verbindung = ShopConnection(name="Shop", connector_type="winterfeld", base_url=BASIS)
    assert isinstance(build_connector(verbindung), WinterfeldShopConnector)


def test_veroeffentlichung_sendet_schluessel_und_centbetrag(antwort):
    gesendet: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        gesendet.append(request)
        return httpx.Response(201, json={"id": "abc-123", "url": f"{BASIS}/produkt/faltkarton"})

    ergebnis = antwort(handler).publish_product(_listing())

    assert ergebnis.external_id == "abc-123"
    assert ergebnis.external_url == f"{BASIS}/produkt/faltkarton"

    request = gesendet[0]
    assert request.url.path == "/api/ingest/produkt"
    assert request.headers["x-api-key"] == "k" * 40

    import json

    body = json.loads(request.content)
    # Geld wandert als ganzzahliger Centbetrag, niemals als Fliesskommazahl.
    assert body["preisCents"] == 1290
    assert isinstance(body["preisCents"], int)
    assert body["sku"] == "WL-1001"
    assert body["bestand"] == 42
    assert body["ean"] == "4006381333931"
    assert body["kategorien"] == [{"name": "Kartons"}]
    assert body["bilder"][0]["url"] == "https://cdn.example.de/1.jpg"
    assert body["aktiv"] is True


def test_bestand_und_preis_gehen_ueber_die_id(antwort):
    import json

    gesendet: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        gesendet.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "abc-123"})

    connector = antwort(handler)
    connector.update_stock("abc-123", 7)
    connector.update_price("abc-123", Decimal("99.99"))
    connector.delist_product("abc-123")

    assert gesendet[0] == {"id": "abc-123", "bestand": 7}
    assert gesendet[1] == {"id": "abc-123", "preisCents": 9999}
    assert gesendet[2] == {"id": "abc-123", "aktiv": False}


def test_falscher_schluessel_wird_als_klarer_fehler_gemeldet(antwort):
    with pytest.raises(ShopConnectorError, match="Zugang verweigert"):
        antwort(lambda request: httpx.Response(401, json={"fehler": "nein"})).publish_product(_listing())


def test_nicht_eingerichtete_schnittstelle_wird_benannt(antwort):
    with pytest.raises(ShopConnectorError, match="nicht eingerichtet"):
        antwort(lambda request: httpx.Response(503, json={"fehler": "nein"})).publish_product(_listing())


def test_netzwerkfehler_fuehrt_zu_retry_fehler_nicht_zum_absturz(antwort):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Verbindung abgelehnt")

    with pytest.raises(ShopConnectorError, match="nicht erreichbar"):
        antwort(handler).publish_product(_listing())


def test_fehlender_api_schluessel_wird_frueh_erkannt():
    connector = WinterfeldShopConnector(BASIS, {})
    with pytest.raises(ShopConnectorError, match="api_key fehlt"):
        connector.publish_product(_listing())


def test_lange_ki_texte_werden_auf_die_grenzen_des_shops_gekuerzt(antwort):
    """Zu lange SEO-Texte liessen den Shop mit 422 ablehnen – die
    Veröffentlichung hinge dann in Wiederholungen."""
    gesendet = {}

    def handler(request):
        import json
        gesendet.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "abc", "pfad": "/produkt/x"})

    connector = antwort(handler)
    connector.publish_product(_listing(
        title="Wort " * 100,
        meta_title="Titel " * 60,
        meta_description="Beschreibung " * 40,
        ean="4006 3813 3393 1",
    ))
    assert len(gesendet["name"]) <= 300
    assert len(gesendet["seoTitel"]) <= 200 and gesendet["seoTitel"].endswith("…")
    assert len(gesendet["seoBeschreibung"]) <= 320
    assert gesendet["ean"] == "4006381333931"


def test_unbrauchbare_ean_wird_weggelassen_statt_abgelehnt(antwort):
    gesendet = {}

    def handler(request):
        import json
        gesendet.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "abc"})

    antwort(handler).publish_product(_listing(ean="unbekannt"))
    assert "ean" not in gesendet


def test_lebensmittel_gehen_mit_ganzen_millilitern_und_pfand_in_cent(antwort):
    gesendet = {}

    def handler(request):
        import json
        gesendet.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "abc"})

    antwort(handler).publish_product(_listing(
        net_content_amount=Decimal("1.5"), net_content_unit="l", units_per_pack=6,
        deposit_amount=Decimal("1.50"), deposit_type="einweg",
        ingredients="Wasser, Zucker, Kohlensäure", allergens="", food_notes="Koffeinhaltig",
    ))
    assert gesendet["inhalt"] == {"menge": 1500, "einheit": "ml", "anzahl": 6}
    assert gesendet["pfandCents"] == 150 and gesendet["pfandArt"] == "einweg"
    assert gesendet["zutaten"] == "Wasser, Zucker, Kohlensäure"
    assert gesendet["lebensmittelHinweise"] == "Koffeinhaltig"
    assert "allergene" not in gesendet


def test_ohne_lebensmittelangaben_bleibt_die_nutzlast_wie_bisher(antwort):
    gesendet = {}

    def handler(request):
        import json
        gesendet.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "abc"})

    antwort(handler).publish_product(_listing())
    assert not {"inhalt", "pfandCents", "pfandArt", "zutaten"} & set(gesendet)
