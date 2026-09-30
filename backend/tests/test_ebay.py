"""eBay-Anbindung gegen eine nachgestellte eBay-Schnittstelle (Antworten im
Format der offiziellen OpenAPI-Beschreibung)."""
import json
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.connectors import ebay
from app.models import Job, Product, ShopConnection, ShopPublication, StockMovement
from app.models.job import JobType
from app.services import ebay_konto

from tests.conftest import auth_headers, make_user, run_all_jobs
from tests.test_publish import make_ready_product


class EbayAttrappe:
    """Beantwortet die eBay-Aufrufe und merkt sich, was ankam."""

    def __init__(self):
        self.anfragen: list[tuple[str, str, dict | None]] = []
        self.aspekte = [
            {"localizedAspectName": "Marke", "aspectConstraint": {"aspectRequired": True,
                                                                   "aspectMode": "FREE_TEXT"}},
            {"localizedAspectName": "Produktart", "aspectConstraint": {"aspectRequired": True,
                                                                        "aspectMode": "FREE_TEXT"}},
            {"localizedAspectName": "Farbe", "aspectConstraint": {"aspectRequired": False,
                                                                   "aspectMode": "SELECTION_ONLY"},
             "aspectValues": [{"localizedValue": "Blau"}, {"localizedValue": "Rot"}]},
        ]
        self.bestellungen: list[dict] = []
        self.standort_da = False
        self.angebote: dict[str, dict] = {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        pfad = request.url.path
        body = json.loads(request.content) if request.content and request.headers.get(
            "content-type", "").startswith("application/json") else None
        self.anfragen.append((request.method, pfad, body))
        if pfad == "/identity/v1/oauth2/token":
            form = parse_qs(request.content.decode())
            if form["grant_type"] == ["authorization_code"]:
                return httpx.Response(200, json={"access_token": "nutzer-a", "expires_in": 7200,
                                                 "refresh_token": "refresh-1",
                                                 "refresh_token_expires_in": 47304000})
            return httpx.Response(200, json={"access_token": "token-" + form["grant_type"][0],
                                             "expires_in": 7200})
        if pfad.startswith("/sell/account/v1/"):
            art = pfad.rsplit("/", 1)[1]
            liste = {"fulfillment_policy": "fulfillmentPolicies", "payment_policy": "paymentPolicies",
                     "return_policy": "returnPolicies"}[art]
            schluessel = {"fulfillment_policy": "fulfillmentPolicyId", "payment_policy": "paymentPolicyId",
                          "return_policy": "returnPolicyId"}[art]
            return httpx.Response(200, json={liste: [{schluessel: art + "-1"}]})
        if pfad == "/sell/inventory/v1/location/lager-1":
            if request.method == "GET":
                return httpx.Response(200, json={}) if self.standort_da else httpx.Response(404, json={})
            self.standort_da = True
            return httpx.Response(204)
        if pfad == "/commerce/taxonomy/v1/get_default_category_tree_id":
            return httpx.Response(200, json={"categoryTreeId": "77"})
        if pfad.endswith("/get_category_suggestions"):
            return httpx.Response(200, json={"categorySuggestions": [
                {"category": {"categoryId": "42", "categoryName": "Akkuschrauber"}}]})
        if pfad.endswith("/get_item_aspects_for_category"):
            return httpx.Response(200, json={"aspects": self.aspekte})
        if pfad.startswith("/sell/inventory/v1/inventory_item/"):
            return httpx.Response(204)
        if pfad == "/sell/inventory/v1/offer" and request.method == "GET":
            sku = request.url.params["sku"]
            treffer = [a for a in self.angebote.values() if a["sku"] == sku]
            return httpx.Response(200, json={"offers": treffer}) if treffer else httpx.Response(404, json={})
        if pfad == "/sell/inventory/v1/offer" and request.method == "POST":
            angebot_id = f"offer-{len(self.angebote) + 1}"
            self.angebote[angebot_id] = {**body, "offerId": angebot_id}
            return httpx.Response(201, json={"offerId": angebot_id})
        if pfad.startswith("/sell/inventory/v1/offer/") and pfad.endswith("/publish"):
            return httpx.Response(200, json={"listingId": "110555"})
        if pfad.startswith("/sell/inventory/v1/offer/") and request.method == "GET":
            return httpx.Response(200, json=self.angebote[pfad.rsplit("/", 1)[1]])
        if pfad == "/sell/inventory/v1/bulk_update_price_quantity":
            return httpx.Response(200, json={"responses": [{"statusCode": 200}]})
        if pfad == "/sell/fulfillment/v1/order":
            return httpx.Response(200, json={"orders": self.bestellungen,
                                             "total": len(self.bestellungen)})
        if pfad.startswith("/sell/fulfillment/v1/order/") and pfad.endswith("/shipping_fulfillment"):
            return httpx.Response(201)
        if pfad.startswith("/sell/fulfillment/v1/order/") and request.method == "GET":
            nummer = pfad.rsplit("/", 1)[1]
            treffer = [b for b in self.bestellungen if b["orderId"] == nummer]
            return httpx.Response(200, json=treffer[0]) if treffer else httpx.Response(404, json={})
        return httpx.Response(500, json={"errors": [{"message": f"unerwartet: {request.method} {pfad}"}]})

    def aufrufe(self, methode: str, pfad: str) -> list[dict | None]:
        return [b for m, p, b in self.anfragen if m == methode and p == pfad]


@pytest.fixture()
def attrappe(monkeypatch):
    from app.config import get_settings
    s = get_settings()
    for name, wert in (("ebay_client_id", "cid"), ("ebay_client_secret", "geheim"),
                       ("ebay_runame", "Winterfeldt-RuName"), ("ebay_umgebung", "production"),
                       ("domain", "lager.example.de")):
        monkeypatch.setattr(s, name, wert)
    a = EbayAttrappe()
    monkeypatch.setattr(ebay, "_transport", httpx.MockTransport(a))
    ebay._token_cache.clear()
    return a


def _ebay(db, **zugang):
    verbindung = ShopConnection(name="eBay", connector_type="ebay", base_url="https://www.ebay.de")
    db.add(verbindung)
    db.flush()
    ebay_konto.zugangsdaten_ergaenzen(verbindung, {"plz": "10115", "ort": "Berlin", **zugang})
    db.commit()
    return verbindung


# ── Anmeldung ───────────────────────────────────────────────────────────────

def test_state_ist_signiert_und_laeuft_ab(db):
    verbindung = _ebay(db)
    state = ebay_konto.state_erzeugen(verbindung)
    assert ebay_konto.state_pruefen(state) == (verbindung.id, verbindung.tenant_id)
    with pytest.raises(ebay_konto.EbayFehler):
        ebay_konto.state_pruefen(state[:-1] + ("0" if state[-1] != "0" else "1"))
    with pytest.raises(ebay_konto.EbayFehler):
        ebay_konto.state_pruefen(state, jetzt=time.time() + ebay_konto.STATE_GUELTIG + 5)


def test_verbinden_und_rueckruf(client, db, admin, attrappe):
    verbindung = _ebay(db)
    headers = auth_headers(client, email="admin@example.com")
    url = client.get(f"/api/v1/shop/ebay/verbinden?connection_id={verbindung.id}",
                     headers=headers).json()["url"]
    teile = urlparse(url)
    q = parse_qs(teile.query)
    assert teile.netloc == "auth.ebay.com" and q["client_id"] == ["cid"]
    assert q["redirect_uri"] == ["Winterfeldt-RuName"]
    assert "sell.inventory" in q["scope"][0] and "sell.fulfillment" in q["scope"][0]

    res = client.get("/api/v1/shop/ebay/rueckruf", params={"state": q["state"][0], "code": "abc"})
    assert res.status_code == 200, res.text
    assert "Mit eBay verbunden" in res.text
    db.expire_all()
    daten = ebay_konto.zugangsdaten(db.get(ShopConnection, verbindung.id))
    assert daten["refresh_token"] == "refresh-1"
    assert daten["fulfillment_policy_id"] == "fulfillment_policy-1"
    assert daten["merchant_location_key"] == "lager-1" and attrappe.standort_da
    # Der Lagerort wurde mit PLZ und Ort angelegt.
    standort = attrappe.aufrufe("POST", "/sell/inventory/v1/location/lager-1")[0]
    assert standort["location"]["address"] == {"postalCode": "10115", "city": "Berlin", "country": "DE"}
    # Der Verkaufsabruf ist eingeplant.
    assert db.query(Job).filter_by(job_type=JobType.MARKTPLATZ_ABGLEICH.value).count() == 1

    falsch = client.get("/api/v1/shop/ebay/rueckruf", params={"state": "x.y.1.z", "code": "abc"})
    assert falsch.status_code == 400
    # Die Zugangsdaten verlassen den Server nicht.
    liste = client.get("/api/v1/shop/connections", headers=headers).json()
    assert "refresh-1" not in json.dumps(liste)
    assert liste[0]["angemeldet"] is True


def test_verbindung_im_lager_web_anlegen_und_aendern(client, db, admin, attrappe):
    headers = auth_headers(client, email="admin@example.com")
    typen = client.get("/api/v1/shop/connector-types", headers=headers).json()
    assert typen["ebay_app_bereit"] is True
    ebay_typ = next(d for d in typen["details"] if d["typ"] == "ebay")
    assert ebay_typ["standard_url"] == "https://www.ebay.de"
    assert [f["schluessel"] for f in ebay_typ["felder"]] == ["plz", "ort"]

    # Portal mit fester Adresse: keine URL nötig.
    res = client.post("/api/v1/shop/connections", headers=headers, json={
        "name": "eBay", "connector_type": "ebay", "credentials": {"plz": "10115", "ort": ""}})
    assert res.status_code == 201, res.text
    neu = res.json()
    assert neu["base_url"] == "https://www.ebay.de" and neu["angemeldet"] is False
    assert client.post("/api/v1/shop/connections", headers=headers, json={
        "name": "Woo", "connector_type": "woocommerce"}).status_code == 422

    # Ort nachtragen, PLZ bleibt erhalten; deaktivieren.
    res = client.patch(f"/api/v1/shop/connections/{neu['id']}", headers=headers,
                       json={"credentials": {"ort": "Berlin", "plz": ""}, "is_active": False})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False
    db.expire_all()
    assert ebay_konto.zugangsdaten(db.get(ShopConnection, neu["id"])) == {"plz": "10115", "ort": "Berlin"}
    make_user(db, email="chef@example.com", role="warehouse_manager")
    assert client.patch(f"/api/v1/shop/connections/{neu['id']}", json={"is_active": True},
                        headers=auth_headers(client, email="chef@example.com")).status_code == 403


# ── Einstellen ──────────────────────────────────────────────────────────────

def _bereit(db, employee, verbindung, sku="ebay-1"):
    produkt = make_ready_product(db, employee, sku)
    produkt.brand = "Bosch Professional"
    produkt.attributes = {"Produktart": "Akkuschrauber", "Farbe": "blau"}
    produkt.kanaele = [verbindung.id]
    db.commit()
    return produkt


def _veroeffentlichen(client, db, produkt):
    make_user(db, email="chef@example.com", role="warehouse_manager")
    res = client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen",
                      headers=auth_headers(client, email="chef@example.com"))
    assert res.status_code == 200, res.text
    run_all_jobs()
    db.expire_all()
    return db.query(ShopPublication).filter_by(product_id=produkt.id).one()


def test_artikel_bei_ebay_einstellen(client, db, employee, attrappe):
    verbindung = _ebay(db, refresh_token="refresh-1")
    produkt = _bereit(db, employee, verbindung)
    pub = _veroeffentlichen(client, db, produkt)
    assert pub.status == "published", pub.error
    assert pub.external_id == "offer-1"
    assert pub.payload_snapshot["url"] == "https://www.ebay.de/itm/110555"

    artikel = attrappe.aufrufe("PUT", f"/sell/inventory/v1/inventory_item/{produkt.internal_sku}")[0]
    assert artikel["condition"] == "NEW"
    assert artikel["availability"]["shipToLocationAvailability"]["quantity"] == 14
    assert artikel["product"]["aspects"] == {"Marke": ["Bosch Professional"],
                                             "Produktart": ["Akkuschrauber"], "Farbe": ["Blau"]}
    assert all(u.startswith("https://lager.example.de/") for u in artikel["product"]["imageUrls"])
    angebot = attrappe.aufrufe("POST", "/sell/inventory/v1/offer")[0]
    assert angebot["categoryId"] == "42" and angebot["marketplaceId"] == "EBAY_DE"
    assert angebot["pricingSummary"]["price"] == {"value": "59.00", "currency": "EUR"}
    assert angebot["listingPolicies"]["paymentPolicyId"] == "payment_policy-1"
    # Der Nutzer-Token kam aus dem gespeicherten refresh_token.
    assert any(m == "POST" and p == "/identity/v1/oauth2/token" for m, p, _ in attrappe.anfragen)


def test_fehlende_pflichtangabe_wird_benannt(client, db, employee, attrappe):
    verbindung = _ebay(db, refresh_token="refresh-1")
    produkt = _bereit(db, employee, verbindung, "ebay-2")
    produkt.attributes = {}
    db.commit()
    pub = _veroeffentlichen(client, db, produkt)
    assert pub.status != "published"
    assert "Produktart" in pub.error and "Merkmale" in pub.error
    assert "Marke" not in pub.error.split("noch:")[1]  # Marke kam aus den Stammdaten


def test_bestand_geht_an_ebay(client, db, employee, attrappe):
    verbindung = _ebay(db, refresh_token="refresh-1")
    produkt = _bereit(db, employee, verbindung, "ebay-3")
    _veroeffentlichen(client, db, produkt)
    make_user(db, email="lager@example.com", role="warehouse_manager")
    client.post(f"/api/v1/products/{produkt.id}/stock-movements",
                headers=auth_headers(client, email="lager@example.com"),
                json={"movement_type": "inbound", "quantity_change": 6})
    run_all_jobs()
    aenderung = attrappe.aufrufe("POST", "/sell/inventory/v1/bulk_update_price_quantity")[-1]
    assert aenderung == {"requests": [{
        "sku": produkt.internal_sku, "offers": [{"offerId": "offer-1", "availableQuantity": 20}],
        "shipToLocationAvailability": {"quantity": 20}}]}


# ── Verkäufe ────────────────────────────────────────────────────────────────

def _bestellung(nummer, sku, menge=1, bezahlt=True, storniert=False):
    return {"orderId": nummer, "creationDate": "2026-09-30T10:00:00.000Z",
            "orderPaymentStatus": "PAID" if bezahlt else "PENDING",
            "cancelStatus": {"cancelState": "CANCELED" if storniert else "NONE_REQUESTED"},
            "pricingSummary": {"total": {"value": "59.00", "currency": "EUR"}},
            "buyer": {"username": "kaeufer1"},
            "fulfillmentStartInstructions": [{"shippingStep": {"shipTo": {
                "fullName": "Erika Muster", "contactAddress": {
                    "addressLine1": "Hauptstr. 1", "postalCode": "12345", "city": "Musterstadt",
                    "countryCode": "DE"}}}}],
            "lineItems": [{"lineItemId": f"{nummer}-1", "sku": sku, "title": "Artikel",
                           "quantity": menge, "lineItemCost": {"value": "59.00"}}]}


def test_verkaeufe_buchen_bestand_ab_ohne_doppelte(db, employee, attrappe):
    verbindung = _ebay(db, refresh_token="refresh-1")
    produkt = make_ready_product(db, employee, "ebay-4")
    attrappe.bestellungen = [
        _bestellung("11-1", produkt.internal_sku, 2),
        _bestellung("11-2", produkt.internal_sku, 1, storniert=True),
        _bestellung("11-3", produkt.internal_sku, 1, bezahlt=False),
        _bestellung("11-4", "GIBT-ES-NICHT"),
    ]
    ergebnis = ebay_konto.verkaeufe_abholen(db, verbindung)
    db.commit()
    assert ergebnis["gebucht"] == 1 and ergebnis["unbekannt"] == ["GIBT-ES-NICHT"]
    db.refresh(produkt)
    assert produkt.stock_quantity == 12
    bewegung = db.query(StockMovement).filter_by(product_id=produkt.id, movement_type="sale").one()
    assert bewegung.reference == "ebay:11-1:11-1-1"

    # Zweiter Abruf (überlappendes Fenster) bucht nicht noch einmal.
    ebay_konto.verkaeufe_abholen(db, verbindung)
    db.commit()
    db.refresh(produkt)
    assert produkt.stock_quantity == 12
    filter_ = parse_qs(urlparse(str([p for m, p, _ in attrappe.anfragen][-1])).query)
    zuletzt = ebay_konto.zugangsdaten(verbindung)["letzter_bestellabruf"]
    assert datetime.fromisoformat(zuletzt) <= datetime.now(timezone.utc)
    del filter_


def test_abruf_plant_sich_selbst_neu_ein(db, employee, attrappe):
    verbindung = _ebay(db, refresh_token="refresh-1")
    ebay_konto.abruf_einplanen(db, verbindung)
    ebay_konto.abruf_einplanen(db, verbindung)  # doppelt → trotzdem nur ein Auftrag
    db.commit()
    assert db.query(Job).filter_by(job_type=JobType.MARKTPLATZ_ABGLEICH.value).count() == 1
    run_all_jobs()
    jobs = db.query(Job).filter_by(job_type=JobType.MARKTPLATZ_ABGLEICH.value).all()
    # Der erste ist erledigt, der nächste wartet (in 5 Minuten).
    assert sorted(j.status for j in jobs) == ["done", "queued"]
    abgeschaltet = db.get(ShopConnection, verbindung.id)
    abgeschaltet.is_active = False
    db.commit()
    for job in jobs:
        job.run_at = datetime.now(timezone.utc)
    db.commit()
    run_all_jobs()
    db.expire_all()
    # Abgeschaltet → die Kette endet.
    assert db.query(Job).filter_by(job_type=JobType.MARKTPLATZ_ABGLEICH.value,
                                   status="queued").count() == 0
    assert db.query(Product).count() == 0


# ── Versand über den Shop-Admin ─────────────────────────────────────────────

def _shop(db):
    shop = ShopConnection(name="Eigener Shop", connector_type="winterfeld",
                          base_url="https://shop.example.de", webhook_secret="shop-geheim")
    db.add(shop)
    db.flush()
    ebay_konto.zugangsdaten_ergaenzen(shop, {"api_key": "k" * 40})
    db.commit()
    return shop


def test_bestellung_geht_zum_versand_an_den_shop(db, employee, attrappe, monkeypatch):
    from app.connectors.winterfeld import WinterfeldShopConnector
    angekommen = []
    monkeypatch.setattr(WinterfeldShopConnector, "bestellung_uebernehmen",
                        lambda self, b: angekommen.append(b) or {"angelegt": True})
    _shop(db)
    verbindung = _ebay(db, refresh_token="refresh-1")
    produkt = make_ready_product(db, employee, "ebay-5")
    bestellung = _bestellung("12-1", produkt.internal_sku, 2)
    bestellung["pricingSummary"]["deliveryCost"] = {"value": "4.90", "currency": "EUR"}
    bestellung["pricingSummary"]["total"] = {"value": "63.90", "currency": "EUR"}
    unbekannt = _bestellung("12-2", "NUR-BEI-EBAY")
    attrappe.bestellungen = [bestellung, unbekannt, _bestellung("12-3", produkt.internal_sku, bezahlt=False)]

    ergebnis = ebay_konto.verkaeufe_abholen(db, verbindung)
    db.commit()
    assert ergebnis["weitergegeben"] == 2  # auch ein Artikel, den das Lager nicht kennt, muss raus
    run_all_jobs()
    erste = next(b for b in angekommen if b["bestellnummer"] == "12-1")
    assert erste["quelle"] == "ebay"
    assert erste["lieferadresse"] == {"name": "Erika Muster", "strasse": "Hauptstr. 1", "zusatz": None,
                                      "plz": "12345", "ort": "Musterstadt", "land": "DE"}
    assert erste["positionen"] == [{"sku": produkt.internal_sku, "name": "Artikel", "menge": 2,
                                    "einzelpreisCents": 2950}]
    assert (erste["versandCents"], erste["summeCents"]) == (490, 6390)

    # Nächster Abruf: bereits gebuchte Bestellung wird nicht erneut weitergegeben.
    angekommen.clear()
    ebay_konto.verkaeufe_abholen(db, verbindung)
    db.commit()
    run_all_jobs()
    assert [b["bestellnummer"] for b in angekommen] == ["12-2"]


def test_sendungsnummer_aus_dem_shop_geht_an_ebay(client, db, attrappe):
    import hashlib
    import hmac
    shop = _shop(db)
    _ebay(db, refresh_token="refresh-1")
    attrappe.bestellungen = [_bestellung("13-1", "X", 1)]
    url = f"/api/v1/shop/webhooks/{shop.id}/versand"

    def senden(daten, geheimnis="shop-geheim"):
        body = json.dumps(daten).encode()
        sig = hmac.new(geheimnis.encode(), body, hashlib.sha256).hexdigest()
        return client.post(url, content=body, headers={"X-Webhook-Signature": sig,
                                                       "content-type": "application/json"})

    meldung = {"quelle": "ebay", "bestellnummer": "13-1", "sendungsnummer": "00340434161094042557",
               "versender": "dhl_paket"}
    assert senden(meldung, "falsch").status_code == 401
    assert senden({**meldung, "quelle": "amazon"}).json()["status"] == "ignoriert"
    assert senden(meldung).json() == {"status": "eingeplant"}
    run_all_jobs()
    eingetragen = attrappe.aufrufe("POST", "/sell/fulfillment/v1/order/13-1/shipping_fulfillment")
    assert len(eingetragen) == 1
    assert eingetragen[0]["lineItems"] == [{"lineItemId": "13-1-1"}]
    assert eingetragen[0]["trackingNumber"] == "00340434161094042557"
    assert eingetragen[0]["shippingCarrierCode"] == "DHL"
