"""Lebensmittelangaben: über die API pflegbar, geprüft, und sie landen im Shoptext-Input."""
from decimal import Decimal

from app.models import Product
from app.services.listing_service import split_fields
from tests.conftest import auth_headers


def _artikel(client, headers):
    return client.post("/api/v1/captures", headers=headers,
                       json={"client_capture_id": "cap-cola-01"}).json()


def test_angaben_speichern_mit_komma_und_einheit(client, db, employee):
    headers = auth_headers(client)
    artikel = _artikel(client, headers)
    antwort = client.patch(f"/api/v1/products/{artikel['id']}", headers=headers, json={
        "net_content_amount": "0,33", "net_content_unit": "L", "units_per_pack": "6",
        "deposit_amount": "1,50", "deposit_type": "Einweg",
        "ingredients": "Wasser, Zucker", "food_notes": "Koffeinhaltig",
    })
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert Decimal(daten["net_content_amount"]) == Decimal("0.33")
    assert daten["net_content_unit"] == "l" and daten["units_per_pack"] == 6
    assert Decimal(daten["deposit_amount"]) == Decimal("1.50") and daten["deposit_type"] == "einweg"
    assert daten["field_sources"]["ingredients"] == "user"


def test_unsinnige_werte_werden_abgelehnt(client, db, employee):
    headers = auth_headers(client)
    artikel = _artikel(client, headers)
    for falsch in ({"net_content_unit": "Fass"}, {"deposit_type": "pfandfrei?"},
                   {"net_content_amount": "-1"}, {"units_per_pack": 0}):
        antwort = client.patch(f"/api/v1/products/{artikel['id']}", headers=headers, json=falsch)
        assert antwort.status_code == 422, falsch


def test_leere_werte_leeren_die_felder(client, db, employee):
    headers = auth_headers(client)
    artikel = _artikel(client, headers)
    client.patch(f"/api/v1/products/{artikel['id']}", headers=headers,
                 json={"net_content_unit": "ml", "units_per_pack": 6})
    antwort = client.patch(f"/api/v1/products/{artikel['id']}", headers=headers,
                           json={"net_content_unit": "", "units_per_pack": ""})
    assert antwort.json()["net_content_unit"] is None and antwort.json()["units_per_pack"] is None


def test_benutzerangaben_zu_lebensmitteln_gehen_als_verifiziert_in_den_shoptext():
    produkt = Product(internal_sku="WL-2", product_name="Cola", net_content_amount=Decimal("1.0"),
                      net_content_unit="l", ingredients="Wasser, Zucker",
                      field_sources={"product_name": "user", "net_content_amount": "user",
                                     "net_content_unit": "user", "ingredients": "user"},
                      field_confidence={})
    verifiziert, _ = split_fields(produkt)
    assert verifiziert["ingredients"] == "Wasser, Zucker"
    assert verifiziert["net_content_unit"] == "l"
