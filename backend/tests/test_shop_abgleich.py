"""Änderungen aus dem Shop-Admin kommen im Lager an (Produkt-Webhook)."""
import hashlib
import hmac
import json
from decimal import Decimal

from app.models import ShopConnection, ShopListing, ShopPublication
from app.services import product_service


def _aufbau(db, employee, *, mit_listing=True, geheimnis="geheim"):
    verbindung = ShopConnection(name="Winterfeldt-Shop", connector_type="winterfeld",
                                base_url="https://shop.example", webhook_secret=geheimnis)
    db.add(verbindung)
    produkt = product_service.create_draft(db, client_capture_id=f"abgleich-{mit_listing}",
                                           user=employee)
    produkt.product_name = "Coca-Cola 6 x 1 l"
    produkt.sale_price = Decimal("11.94")
    produkt.publication_status = "published"
    db.flush()
    if mit_listing:
        db.add(ShopListing(product_id=produkt.id, seo_title="Coca-Cola Original 6er",
                           short_description="alt", long_description="<p>alt</p>"))
    db.add(ShopPublication(product_id=produkt.id, connection_id=verbindung.id,
                           external_id="shop-123", status="published"))
    db.commit()
    return verbindung, produkt


def _senden(client, verbindung, daten, geheimnis="geheim"):
    koerper = json.dumps(daten).encode()
    signatur = hmac.new(geheimnis.encode(), koerper, hashlib.sha256).hexdigest()
    return client.post(f"/api/v1/shop/webhooks/{verbindung.id}/product", content=koerper,
                       headers={"content-type": "application/json",
                                "X-Webhook-Signature": signatur})


def test_name_preis_und_texte_landen_im_listing_und_artikel(client, db, employee):
    verbindung, produkt = _aufbau(db, employee)
    antwort = _senden(client, verbindung, {"sku": produkt.internal_sku, "action": "update",
        "changes": {"name": "Coca-Cola Original 6 × 1 l", "priceCents": 1299,
                    "shortDescription": "Neu", "description": "<p>Neu</p>",
                    "seoTitle": "Cola kaufen", "seoDescription": "Günstig"}})
    assert antwort.status_code == 200, antwort.text
    db.expire_all()
    listing = db.query(ShopListing).filter_by(product_id=produkt.id).one()
    assert listing.seo_title == "Coca-Cola Original 6 × 1 l"
    assert listing.short_description == "Neu" and listing.long_description == "<p>Neu</p>"
    assert listing.meta_title == "Cola kaufen" and listing.meta_description == "Günstig"
    artikel = db.get(type(produkt), produkt.id)
    assert artikel.sale_price == Decimal("12.99")
    assert artikel.field_sources["sale_price"] == "user"


def test_ohne_listing_geht_der_name_an_den_artikel(client, db, employee):
    verbindung, produkt = _aufbau(db, employee, mit_listing=False)
    _senden(client, verbindung, {"sku": produkt.internal_sku, "action": "update",
                                 "changes": {"name": "Neuer Name"}})
    db.expire_all()
    assert db.get(type(produkt), produkt.id).product_name == "Neuer Name"


def test_ausblenden_einblenden_und_loeschen(client, db, employee):
    verbindung, produkt = _aufbau(db, employee)
    _senden(client, verbindung, {"sku": produkt.internal_sku, "action": "deactivate"})
    db.expire_all()
    pub = db.query(ShopPublication).filter_by(product_id=produkt.id).one()
    assert pub.status == "delisted" and pub.external_id == "shop-123"
    assert db.get(type(produkt), produkt.id).publication_status == "ready"

    _senden(client, verbindung, {"sku": produkt.internal_sku, "action": "activate"})
    db.expire_all()
    assert db.query(ShopPublication).filter_by(product_id=produkt.id).one().status == "published"

    _senden(client, verbindung, {"sku": produkt.internal_sku, "action": "delete"})
    db.expire_all()
    pub = db.query(ShopPublication).filter_by(product_id=produkt.id).one()
    assert pub.status == "delisted" and pub.external_id is None


def test_musterartikel_und_falsche_signatur(client, db, employee):
    verbindung, _ = _aufbau(db, employee)
    antwort = _senden(client, verbindung, {"sku": "WL-TAP-48", "action": "delete"})
    assert antwort.status_code == 200 and antwort.json()["status"] == "unknown_sku"
    falsch = _senden(client, verbindung, {"sku": "WL-TAP-48", "action": "delete"},
                     geheimnis="falsch")
    assert falsch.status_code == 401
    assert _senden(client, verbindung, {"sku": "x", "action": "kaputt"}).status_code == 422
