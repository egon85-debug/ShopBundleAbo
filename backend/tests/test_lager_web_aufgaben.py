"""Lager-Web: offene Aufgaben, Artikel löschen, Bestandskorrektur mit Begründung."""
from app.models import AuditLog, Product, ShopPublication

from tests.conftest import auth_headers, jpeg_bytes, run_all_jobs


def _artikel(client, headers, name):
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": name}).json()
    res = client.post(f"/api/v1/captures/{capture['id']}/images", headers=headers,
                      files={"file": ("f.jpg", jpeg_bytes(), "image/jpeg")},
                      data={"role": "front", "client_image_id": f"{name}-1"})
    assert res.status_code == 200, res.text
    run_all_jobs()
    return capture["id"]


def test_offene_aufgaben_nennt_was_fehlt(client, db, employee):
    headers = auth_headers(client)
    produkt = _artikel(client, headers, "aufgabe-1")
    daten = client.get("/api/v1/products/aufgaben", headers=headers).json()
    eintrag = next(a for a in daten["artikel"] if a["id"] == produkt)
    # Nach der Aufnahme fehlen Verkaufspreis und Bestand (Fake-Erkennung liefert beides nicht).
    assert "Bestand" in eintrag["fehlt"]
    assert daten["fehlgeschlagene_auftraege"] == 0


def test_vollstaendiger_artikel_ist_keine_aufgabe(client, db, employee):
    headers = auth_headers(client)
    produkt = _artikel(client, headers, "aufgabe-2")
    p = db.get(Product, produkt)
    p.sale_price, p.stock_quantity, p.category, p.condition = 19.9, 3, "Werkzeug", "new"
    p.long_description, p.open_questions = "Text", []
    db.commit()
    daten = client.get("/api/v1/products/aufgaben", headers=headers).json()
    assert produkt not in {a["id"] for a in daten["artikel"]}


def test_loeschen_braucht_artikelnummer_und_leitung(client, db, employee, admin):
    headers = auth_headers(client)
    produkt = _artikel(client, headers, "loeschen-1")
    sku = db.get(Product, produkt).internal_sku
    # Mitarbeitende dürfen nicht löschen.
    assert client.delete(f"/api/v1/products/{produkt}?bestaetigung={sku}",
                         headers=headers).status_code == 403
    admin_headers = auth_headers(client, email="admin@example.com")
    falsch = client.delete(f"/api/v1/products/{produkt}?bestaetigung=falsch", headers=admin_headers)
    assert falsch.status_code == 422 and sku in falsch.json()["detail"]
    ok = client.delete(f"/api/v1/products/{produkt}?bestaetigung={sku}", headers=admin_headers)
    assert ok.status_code == 204
    db.expire_all()
    assert db.get(Product, produkt) is None
    eintrag = db.query(AuditLog).filter(AuditLog.entity_id == produkt,
                                        AuditLog.action == "delete").one()
    assert sku in eintrag.old_value


def test_veroeffentlichter_artikel_wird_nicht_geloescht(client, db, employee, admin):
    from app.models import ShopConnection
    headers = auth_headers(client)
    produkt = _artikel(client, headers, "loeschen-2")
    verbindung = ShopConnection(name="Shop", connector_type="winterfeld",
                                base_url="https://shop.example")
    db.add(verbindung)
    db.flush()
    db.add(ShopPublication(product_id=produkt, connection_id=verbindung.id,
                           status="published", external_id="42"))
    db.commit()
    sku = db.get(Product, produkt).internal_sku
    admin_headers = auth_headers(client, email="admin@example.com")
    res = client.delete(f"/api/v1/products/{produkt}?bestaetigung={sku}", headers=admin_headers)
    assert res.status_code == 409 and "Shop" in res.json()["detail"]
    assert db.get(Product, produkt) is not None


def test_korrektur_ohne_begruendung_wird_abgelehnt(client, db, employee, admin):
    headers = auth_headers(client)
    produkt = _artikel(client, headers, "korrektur-1")
    admin_headers = auth_headers(client, email="admin@example.com")
    url = f"/api/v1/products/{produkt}/stock-movements"
    ohne = client.post(url, headers=admin_headers,
                       json={"movement_type": "manual_correction", "quantity_change": 5})
    assert ohne.status_code == 422 and "Begründung" in ohne.json()["detail"]
    mit = client.post(url, headers=admin_headers, json={
        "movement_type": "manual_correction", "quantity_change": 5,
        "reason": "Inventur: 5 Stück gezählt"})
    assert mit.status_code == 201, mit.text
    db.expire_all()
    assert db.get(Product, produkt).stock_quantity == 5
    # Wareneingang braucht weiterhin keine Begründung.
    eingang = client.post(url, headers=admin_headers,
                          json={"movement_type": "inbound", "quantity_change": 2})
    assert eingang.status_code == 201
