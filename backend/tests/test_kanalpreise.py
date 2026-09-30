"""Preise je Vertriebskanal: Aufschlag in Prozent (Provision von eBay & Co.),
Rundung auf ,99, fester Preis je Artikel – und der Abgleich bei Änderungen."""
from decimal import Decimal

from app.models import Job, ShopConnection, ShopPublication
from app.models.job import JobType
from app.services.kanaele import aufgeschlagen

from tests.conftest import auth_headers, make_user, run_all_jobs
from tests.test_publish import make_ready_product, published_payloads


def _kanal(db, name, typ="recording-test", aufschlag="0", runden=False):
    verbindung = ShopConnection(name=name, connector_type=typ, base_url="https://example.org",
                                preis_aufschlag=Decimal(aufschlag), preis_runden=runden)
    db.add(verbindung)
    db.commit()
    return verbindung


def _chef(db, client):
    make_user(db, email="chef@example.com", role="warehouse_manager")
    return auth_headers(client, email="chef@example.com")


def _preise(published):
    return sorted((p[1], p[2]) for p in published if isinstance(p, tuple) and p[0] == "price")


def test_aufschlag_und_rundung():
    assert aufgeschlagen(Decimal("11.90"), Decimal("12"), False) == Decimal("13.33")
    assert aufgeschlagen(Decimal("11.90"), Decimal("12"), True) == Decimal("13.99")
    assert aufgeschlagen(Decimal("12.99"), Decimal("0"), True) == Decimal("12.99")
    assert aufgeschlagen(Decimal("13.00"), Decimal("0"), True) == Decimal("13.99")
    assert aufgeschlagen(Decimal("10.00"), Decimal("0"), False) == Decimal("10.00")


def test_preis_je_kanal_in_der_auswahl(client, db, employee):
    shop = _kanal(db, "Eigener Shop")
    ebay = _kanal(db, "eBay", aufschlag="12", runden=True)
    ka = _kanal(db, "Kleinanzeigen", typ="kleinanzeigen")
    produkt = make_ready_product(db, employee, "preis-1")  # 59,00 €
    headers = auth_headers(client)
    res = client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers, json={
        "connection_ids": [shop.id, ebay.id, ka.id], "preise": {ka.id: "50"}})
    assert res.status_code == 200, res.text
    assert res.json()["kanal_preise"] == {ka.id: "50.00"}

    liste = {k["name"]: k for k in client.get(
        f"/api/v1/shop/kanaele?product_id={produkt.id}", headers=headers).json()}
    assert liste["Eigener Shop"]["preis"] == "59.00" and liste["Eigener Shop"]["preis_fest"] is None
    assert liste["eBay"]["preis"] == "66.99"  # 59 € + 12 % = 66,08 → ,99
    assert (liste["eBay"]["preis_aufschlag"], liste["eBay"]["preis_runden"]) == ("12.00", True)
    assert liste["Kleinanzeigen"]["preis"] == "50.00" and liste["Kleinanzeigen"]["preis_fest"] == "50.00"

    # Fester Preis wieder weg → Verkaufspreis ("" wie aus der App, null wie aus dem Lager-Web).
    client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers, json={
        "connection_ids": [shop.id, ebay.id, ka.id], "preise": {ka.id: "49,90", ebay.id: None}})
    assert client.get(f"/api/v1/products/{produkt.id}", headers=headers).json()["kanal_preise"] == {
        ka.id: "49.90"}
    client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers, json={
        "connection_ids": [shop.id, ebay.id, ka.id], "preise": {ka.id: ""}})
    liste = {k["name"]: k for k in client.get(
        f"/api/v1/shop/kanaele?product_id={produkt.id}", headers=headers).json()}
    assert liste["Kleinanzeigen"]["preis"] == "59.00"
    assert client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers, json={
        "connection_ids": [], "preise": {shop.id: "0"}}).status_code == 422


def test_veroeffentlichung_mit_kanalpreis(client, db, employee):
    published_payloads.clear()
    shop = _kanal(db, "Eigener Shop")
    ebay = _kanal(db, "eBay-Test", aufschlag="10")
    produkt = make_ready_product(db, employee, "preis-2")
    produkt.kanaele = [shop.id, ebay.id]
    db.commit()
    client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen", headers=_chef(db, client))
    run_all_jobs()
    assert sorted(p.price for p in published_payloads if not isinstance(p, tuple)) == [
        Decimal("59.00"), Decimal("64.90")]


def test_preisaenderungen_gehen_an_die_kanaele(client, db, employee):
    shop = _kanal(db, "Eigener Shop")
    ebay = _kanal(db, "eBay-Test", aufschlag="10")
    fest = make_ready_product(db, employee, "preis-3")
    frei = make_ready_product(db, employee, "preis-4")
    for produkt, ext in ((fest, "f"), (frei, "x")):
        for verbindung in (shop, ebay):
            db.add(ShopPublication(product_id=produkt.id, connection_id=verbindung.id,
                                   external_id=f"{ext}-{verbindung.name}", status="published"))
    fest.kanal_preise = {ebay.id: "70.00"}
    db.commit()
    chef = _chef(db, client)

    # Neuer Verkaufspreis → alle Kanäle, jeweils mit ihrem Preis.
    published_payloads.clear()
    client.patch(f"/api/v1/products/{frei.id}", headers=chef, json={"sale_price": "100.00"})
    run_all_jobs()
    assert _preise(published_payloads) == [("x-Eigener Shop", Decimal("100.00")),
                                           ("x-eBay-Test", Decimal("110.00"))]

    # Neuer Aufschlag bei eBay → nur Artikel ohne festen eBay-Preis.
    published_payloads.clear()
    make_user(db, email="admin2@example.com", role="admin")
    res = client.patch(f"/api/v1/shop/connections/{ebay.id}", json={"preis_aufschlag": "15"},
                       headers=auth_headers(client, email="admin2@example.com"))
    assert res.status_code == 200 and res.json()["preis_aufschlag"] == "15.00"
    run_all_jobs()
    assert _preise(published_payloads) == [("x-eBay-Test", Decimal("115.00"))]

    # Fester Preis geändert → nur dieser Kanal.
    published_payloads.clear()
    client.put(f"/api/v1/products/{fest.id}/kanaele", headers=chef, json={
        "connection_ids": [shop.id, ebay.id], "preise": {ebay.id: "72.50"}})
    run_all_jobs()
    assert _preise(published_payloads) == [("f-eBay-Test", Decimal("72.50"))]
    assert db.query(Job).filter_by(job_type=JobType.SYNC_PRICE.value, status="dead").count() == 0


def test_kleinanzeige_preis_von_hand_aendern(client, db, employee):
    ka = _kanal(db, "Kleinanzeigen", typ="kleinanzeigen", aufschlag="0", runden=True)
    produkt = make_ready_product(db, employee, "preis-5")
    produkt.kanaele = [ka.id]
    db.commit()
    chef = _chef(db, client)
    assert client.get(f"/api/v1/shop/products/{produkt.id}/kleinanzeigen",
                      headers=chef).json()["preis"] == "59.99"
    client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen", headers=chef)
    pub = db.query(ShopPublication).filter_by(product_id=produkt.id).one()
    client.post(f"/api/v1/shop/publications/{pub.id}/online", headers=chef, json={
        "url": "https://www.kleinanzeigen.de/s-anzeige/x/2987654321-243-1234"})

    def aufgaben():
        alle = client.get("/api/v1/products/aufgaben", headers=chef).json()["artikel"]
        return [k["text"] for a in alle if a["id"] == produkt.id for k in a["kanal_aufgaben"]]

    assert aufgaben() == []
    client.patch(f"/api/v1/products/{produkt.id}", headers=chef, json={"sale_price": "45.00"})
    assert aufgaben() == ["Kleinanzeigen: Preis auf 45,99 € ändern"]
    assert client.post(f"/api/v1/shop/publications/{pub.id}/preis-geaendert",
                       headers=chef).json()["preis"] == "45.99"
    assert aufgaben() == []
