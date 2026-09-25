"""Einrichtung der Shop-Anbindung: Befehl shop-verbinden und oeffentliche Bildadressen."""
import json
import re

import pytest

from app import cli
from app.config import get_settings
from app.models import ShopConnection
from app.providers.storage_local import LocalObjectStorage
from app.utils.security import decrypt_credentials


@pytest.fixture()
def domain(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "domain", "lager.example.de")
    monkeypatch.setattr(s, "media_public_base_url", "")
    return s


def _werte(ausgabe: str) -> dict:
    return dict(re.findall(r"^\s+(INGEST_API_KEY|LAGER_WEBHOOK_URL|LAGER_WEBHOOK_SECRET)\s+(\S+)",
                           ausgabe, re.M))


def test_verbindung_anlegen_und_werte_fuer_vercel(engine, db, domain, capsys):
    cli.shop_verbinden("https://shop.example.app/", "Winterfeld Shop")
    werte = _werte(capsys.readouterr().out)

    verbindung = db.query(ShopConnection).one()
    assert verbindung.connector_type == "winterfeld"
    assert verbindung.base_url == "https://shop.example.app"
    assert json.loads(decrypt_credentials(verbindung.credentials_encrypted)) == \
        {"api_key": werte["INGEST_API_KEY"]}
    assert len(werte["INGEST_API_KEY"]) == 64  # der Shop verlangt mind. 32 Zeichen
    assert verbindung.webhook_secret == werte["LAGER_WEBHOOK_SECRET"]
    assert werte["LAGER_WEBHOOK_URL"] == \
        f"https://lager.example.de/api/v1/shop/webhooks/{verbindung.id}/order"


def test_zweiter_aufruf_erneuert_statt_zu_verdoppeln(engine, db, domain, capsys):
    cli.shop_verbinden("https://shop.example.app", "Winterfeld Shop")
    erster = _werte(capsys.readouterr().out)
    cli.shop_verbinden("https://shop.example.app", "Winterfeld Shop")
    zweiter = _werte(capsys.readouterr().out)
    assert db.query(ShopConnection).count() == 1
    assert erster["INGEST_API_KEY"] != zweiter["INGEST_API_KEY"]
    assert erster["LAGER_WEBHOOK_URL"] == zweiter["LAGER_WEBHOOK_URL"]


def test_ohne_domain_kein_webhook(engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "domain", "")
    with pytest.raises(SystemExit):
        cli.shop_verbinden("https://shop.example.app", "Winterfeld Shop")


def test_webhook_mit_den_ausgegebenen_werten(client, engine, db, domain, capsys, employee):
    """Der Shop signiert mit LAGER_WEBHOOK_SECRET — das Lager muss das annehmen."""
    import hashlib
    import hmac
    cli.shop_verbinden("https://shop.example.app", "Winterfeld Shop")
    werte = _werte(capsys.readouterr().out)
    pfad = werte["LAGER_WEBHOOK_URL"].removeprefix("https://lager.example.de")
    koerper = json.dumps({"order_id": "B-1", "items": [{"sku": "gibt-es-nicht", "quantity": 1}]})
    signatur = hmac.new(werte["LAGER_WEBHOOK_SECRET"].encode(), koerper.encode(),
                        hashlib.sha256).hexdigest()
    ok = client.post(pfad, content=koerper, headers={"X-Webhook-Signature": signatur,
                                                     "content-type": "application/json"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["results"][0]["status"] == "unknown_sku"
    falsch = client.post(pfad, content=koerper, headers={"X-Webhook-Signature": "0" * 64})
    assert falsch.status_code == 401


class TestBildadressen:
    def test_aus_der_domain(self, domain):
        assert LocalObjectStorage().public_url("products/a/b.shop.jpg") == \
            "https://lager.example.de/api/v1/media/products/a/b.shop.jpg"

    def test_ausdruecklich_gesetzt_hat_vorrang(self, domain):
        domain.media_public_base_url = "https://cdn.example.de/medien/"
        assert LocalObjectStorage().public_url("x.jpg") == "https://cdn.example.de/medien/x.jpg"

    def test_ohne_beides_relativ(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "domain", "")
        monkeypatch.setattr(get_settings(), "media_public_base_url", "")
        assert LocalObjectStorage().public_url("x.jpg") is None
