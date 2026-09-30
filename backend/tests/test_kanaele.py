"""Vertriebskanäle: Auswahl nach der Erfassung, Veröffentlichen auf allen
gewählten, Kleinanzeigen halbautomatisch, Bestand auf allen Kanälen."""
from decimal import Decimal

from app.models import Job, ShopConnection, ShopListing, ShopPublication
from app.models.job import JobType

from tests.conftest import auth_headers, make_user, run_all_jobs
from tests.test_publish import make_ready_product, published_payloads


def _kanal(db, name, typ, url="https://example.org"):
    verbindung = ShopConnection(name=name, connector_type=typ, base_url=url)
    db.add(verbindung)
    db.commit()
    return verbindung


def _chef(db, client):
    make_user(db, email="chef@example.com", role="warehouse_manager")
    return auth_headers(client, email="chef@example.com")


def test_kanalliste_fuer_mitarbeitende_ohne_zugangsdaten(client, db, employee):
    _kanal(db, "Eigener Shop", "recording-test")
    _kanal(db, "Kleinanzeigen", "kleinanzeigen", "https://www.kleinanzeigen.de")
    inaktiv = _kanal(db, "Alt", "recording-test")
    inaktiv.is_active = False
    db.commit()
    kanaele = client.get("/api/v1/shop/kanaele", headers=auth_headers(client)).json()
    assert [k["name"] for k in kanaele] == ["Eigener Shop", "Kleinanzeigen"]
    assert kanaele[1] == {"id": kanaele[1]["id"], "name": "Kleinanzeigen",
                          "connector_type": "kleinanzeigen", "portal": "Kleinanzeigen",
                          "manuell": True, "preis_aufschlag": "0.00", "preis_runden": False}
    assert "base_url" not in kanaele[0]


def test_kanaele_waehlen(client, db, employee):
    shop = _kanal(db, "Eigener Shop", "recording-test")
    ka = _kanal(db, "Kleinanzeigen", "kleinanzeigen")
    produkt = make_ready_product(db, employee, "kanal-1")
    headers = auth_headers(client)
    res = client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers,
                     json={"connection_ids": [shop.id, ka.id, shop.id]})
    assert res.status_code == 200, res.text
    assert res.json()["kanaele"] == [shop.id, ka.id]
    falsch = client.put(f"/api/v1/products/{produkt.id}/kanaele", headers=headers,
                        json={"connection_ids": ["gibt-es-nicht"]})
    assert falsch.status_code == 422
    # Fremde Erfassungen darf ein Mitarbeiter nicht umstellen.
    make_user(db, email="kollege@example.com")
    fremd = client.put(f"/api/v1/products/{produkt.id}/kanaele",
                       headers=auth_headers(client, email="kollege@example.com"),
                       json={"connection_ids": []})
    assert fremd.status_code == 403


def test_freigabe_veroeffentlicht_auf_allen_gewaehlten(client, db, employee):
    published_payloads.clear()
    shop = _kanal(db, "Eigener Shop", "recording-test")
    ka = _kanal(db, "Kleinanzeigen", "kleinanzeigen")
    produkt = make_ready_product(db, employee, "kanal-2")
    produkt.kanaele = [shop.id, ka.id]
    db.commit()

    chef = _chef(db, client)
    res = client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen", headers=chef)
    assert res.status_code == 200, res.text
    status = {e["name"]: e["status"] for e in res.json()["ergebnisse"]}
    assert status == {"Eigener Shop": "pending", "Kleinanzeigen": "vorbereitet"}
    run_all_jobs()
    assert len([p for p in published_payloads if not isinstance(p, tuple)]) == 1

    stand = {v["name"]: v["status"] for v in client.get(
        f"/api/v1/shop/products/{produkt.id}/veroeffentlichungen", headers=chef).json()}
    assert stand == {"Eigener Shop": "published", "Kleinanzeigen": "vorbereitet"}
    # Die Kleinanzeigen-Anzeige wartet unter „Offene Aufgaben“.
    aufgaben = client.get("/api/v1/products/aufgaben", headers=chef).json()["artikel"]
    eintrag = next(a for a in aufgaben if a["id"] == produkt.id)
    assert eintrag["kanal_aufgaben"][0]["text"] == "Kleinanzeigen: Anzeige einstellen"

    # Nur Leitung und Admin veröffentlichen.
    assert client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen",
                       headers=auth_headers(client)).status_code == 403


def test_nicht_bereit_haelt_andere_kanaele_nicht_auf(client, db, employee):
    shop = _kanal(db, "Eigener Shop", "recording-test")
    ka = _kanal(db, "Kleinanzeigen", "kleinanzeigen")
    produkt = make_ready_product(db, employee, "kanal-3")
    produkt.kanaele = [ka.id, shop.id]
    produkt.long_description = None  # der eigene Shop verlangt eine Beschreibung
    db.commit()
    res = client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen", headers=_chef(db, client))
    ergebnisse = {e["name"]: e for e in res.json()["ergebnisse"]}
    assert ergebnisse["Kleinanzeigen"]["status"] == "vorbereitet"
    assert ergebnisse["Eigener Shop"]["status"] == "fehlt"
    assert "Produktbeschreibung" in ergebnisse["Eigener Shop"]["fehlt"]


def test_kleinanzeigen_entwurf(client, db, employee):
    produkt = make_ready_product(db, employee, "kanal-4")
    produkt.product_name = "Febreze Lufterfrischer Morgentau " + "sehr langer Zusatz " * 5
    produkt.manufacturer = "Procter & Gamble"
    produkt.ean = "8006530212922"
    produkt.sale_price = Decimal("4.5")
    db.add(ShopListing(product_id=produkt.id, long_description=(
        "<p>Frische für jeden Raum.</p><ul><li>Duft: Morgentau</li><li>300 ml</li></ul>")))
    db.commit()
    entwurf = client.get(f"/api/v1/shop/products/{produkt.id}/kleinanzeigen",
                         headers=auth_headers(client)).json()
    assert len(entwurf["titel"]) <= 65 and entwurf["titel"].endswith("…")
    assert entwurf["text"].startswith("Frische für jeden Raum.\n\n• Duft: Morgentau\n• 300 ml")
    assert "<" not in entwurf["text"]
    assert "Zustand: Neu" in entwurf["text"] and "EAN: 8006530212922" in entwurf["text"]
    assert entwurf["preis"] == "4.50"
    assert len(entwurf["bilder"]) == 1 and "sig=" in entwurf["bilder"][0]["url"]


def test_kleinanzeigen_online_ausverkauft_loeschen(client, db, employee):
    ka = _kanal(db, "Kleinanzeigen", "kleinanzeigen")
    produkt = make_ready_product(db, employee, "kanal-5")
    produkt.kanaele = [ka.id]
    db.commit()
    chef = _chef(db, client)
    client.post(f"/api/v1/shop/products/{produkt.id}/veroeffentlichen", headers=chef)
    pub = db.query(ShopPublication).filter_by(product_id=produkt.id).one()

    falsch = client.post(f"/api/v1/shop/publications/{pub.id}/online", headers=chef,
                         json={"url": "https://betrug.example/anzeige"})
    assert falsch.status_code == 422
    res = client.post(f"/api/v1/shop/publications/{pub.id}/online", headers=chef, json={
        "url": "https://www.kleinanzeigen.de/s-anzeige/febreze-morgentau/2987654321-243-1234"})
    assert res.json() == {"status": "published", "external_id": "2987654321"}

    # Alles verkauft (z. B. im eigenen Shop) → Aufgabe „Anzeige löschen“.
    abgang = client.post(f"/api/v1/products/{produkt.id}/stock-movements", headers=chef, json={
        "movement_type": "manual_correction", "quantity_change": -produkt.stock_quantity,
        "reason": "Test: alles verkauft"})
    assert abgang.status_code in (200, 201), abgang.text
    run_all_jobs()
    db.expire_all()
    assert db.get(ShopPublication, pub.id).status == "zu_loeschen"
    aufgaben = client.get("/api/v1/products/aufgaben", headers=chef).json()["artikel"]
    eintrag = next(a for a in aufgaben if a["id"] == produkt.id)
    assert eintrag["kanal_aufgaben"][0]["text"] == "Kleinanzeigen: Anzeige löschen – ausverkauft"

    client.post(f"/api/v1/shop/publications/{pub.id}/geloescht", headers=chef)
    db.expire_all()
    assert db.get(ShopPublication, pub.id).status == "delisted"
    aufgaben = client.get("/api/v1/products/aufgaben", headers=chef).json()["artikel"]
    assert not [a for a in aufgaben if a["id"] == produkt.id and a.get("kanal_aufgaben")]


def test_bestand_geht_an_jeden_kanal(client, db, employee):
    a = _kanal(db, "Shop A", "recording-test")
    b = _kanal(db, "Shop B", "recording-test")
    produkt = make_ready_product(db, employee, "kanal-6")
    for verbindung, ext in ((a, "a-1"), (b, "b-1")):
        db.add(ShopPublication(product_id=produkt.id, connection_id=verbindung.id,
                               external_id=ext, status="published"))
    db.commit()
    published_payloads.clear()
    client.post(f"/api/v1/products/{produkt.id}/stock-movements", headers=_chef(db, client),
                json={"movement_type": "inbound", "quantity_change": 3})
    assert db.query(Job).filter_by(job_type=JobType.SYNC_STOCK.value).count() == 2
    run_all_jobs()
    assert sorted(p[1] for p in published_payloads if isinstance(p, tuple)) == ["a-1", "b-1"]
