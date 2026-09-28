"""Bilder: Ablage je Firma, signierte Adressen, öffentlich nur veröffentlichte Shopbilder."""
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select

from app.models import ImageKind, Product, ProductImage, Role, VoiceRecording
from app.services import medien
from tests.conftest import TEST_MANDANT, auth_headers, jpeg_bytes, make_user, run_all_jobs, sitzung
from tests.test_mandanten import MANDANT_B, firma_b  # noqa: F401  (Fixture)


def _aufnahme(client, kopf, erfassung="medien-0001"):
    capture = client.post("/api/v1/captures", headers=kopf,
                          json={"client_capture_id": erfassung}).json()
    antwort = client.post(f"/api/v1/captures/{capture['id']}/images", headers=kopf,
                          files={"file": ("front.jpg", jpeg_bytes(), "image/jpeg")},
                          data={"role": "front"})
    assert antwort.status_code == 200, antwort.text
    return antwort.json()


def _pfad(url: str) -> str:
    """Adresse ohne Signatur (wie ein Fremder sie sähe)."""
    return urlsplit(url).path


@pytest.fixture()
def kopf(client, engine):
    with sitzung() as db:
        make_user(db, email="lager@example.com", role=Role.ADMIN.value)
    return auth_headers(client, email="lager@example.com")


class TestAblage:
    def test_neue_bilder_liegen_unter_der_firma(self, client, kopf):
        produkt = _aufnahme(client, kopf)
        schluessel = produkt["images"][0]["storage_key"]
        assert schluessel.startswith(f"m/{TEST_MANDANT}/produkte/{produkt['id']}/original/")

    def test_shopbild_liegt_neben_dem_original(self):
        original = f"m/{TEST_MANDANT}/produkte/p1/original/abc.jpg"
        assert medien.schluessel_shopbild(original) == f"m/{TEST_MANDANT}/produkte/p1/shop/abc.jpg"
        # Alte Ablage bleibt bei ihrem Muster.
        assert medien.schluessel_shopbild("products/p1/original/abc.png") == \
            "products/p1/original/abc.shop.jpg"


class TestZugriff:
    def test_original_nur_mit_signatur(self, client, kopf):
        produkt = _aufnahme(client, kopf)
        url = produkt["images"][0]["url"]
        assert "sig=" in url
        mit = client.get(url)
        assert mit.status_code == 200
        assert mit.headers["cache-control"].startswith("private")
        assert client.get(_pfad(url)).status_code == 404

    def test_signatur_gilt_nur_fuer_diese_datei(self, client, kopf):
        a = _aufnahme(client, kopf, "medien-a")["images"][0]
        b = _aufnahme(client, kopf, "medien-b")["images"][0]
        abfrage = parse_qs(urlsplit(a["url"]).query)
        fremd = f"{_pfad(b['url'])}?ablauf={abfrage['ablauf'][0]}&sig={abfrage['sig'][0]}"
        assert client.get(fremd).status_code == 404

    def test_veraenderte_oder_abgelaufene_signatur(self, client, kopf):
        bild = _aufnahme(client, kopf)["images"][0]
        abfrage = parse_qs(urlsplit(bild["url"]).query)
        ablauf, sig = abfrage["ablauf"][0], abfrage["sig"][0]
        kaputt = "0" * len(sig)
        assert client.get(f"{_pfad(bild['url'])}?ablauf={ablauf}&sig={kaputt}").status_code == 404
        spaeter = int(ablauf) + 86_400
        assert client.get(f"{_pfad(bild['url'])}?ablauf={spaeter}&sig={sig}").status_code == 404
        key = bild["storage_key"]
        alt = medien.signierte_url(key, jetzt=0)  # vor Jahrzehnten abgelaufen
        assert client.get(alt).status_code == 404

    def test_adresse_bleibt_einen_tag_gleich(self):
        tag = 20_000 * 86_400
        assert medien.signierte_url("k", jetzt=tag + 10) == medien.signierte_url("k", jetzt=tag + 80_000)
        assert medien.ablauf_fuer(tag + 10) - (tag + 10) > 86_400

    def test_shopbild_erst_nach_veroeffentlichung_oeffentlich(self, client, kopf):
        produkt = _aufnahme(client, kopf)
        run_all_jobs()
        with sitzung() as db:
            shopbild = db.scalar(select(ProductImage).where(
                ProductImage.product_id == produkt["id"],
                ProductImage.kind == ImageKind.OPTIMIZED.value))
            assert shopbild is not None
            key = shopbild.storage_key
        assert "/shop/" in key
        url = f"/api/v1/media/{key}"
        assert client.get(url).status_code == 404
        with sitzung() as db:
            db.get(Product, produkt["id"]).publication_status = "published"
            db.commit()
        antwort = client.get(url)
        assert antwort.status_code == 200
        assert antwort.headers["cache-control"].startswith("public")
        # Das Original bleibt auch dann privat.
        original = produkt["images"][0]["storage_key"]
        assert client.get(f"/api/v1/media/{original}").status_code == 404

    def test_sprachaufnahmen_werden_nie_ausgeliefert(self, client, kopf):
        produkt = _aufnahme(client, kopf)
        antwort = client.post(f"/api/v1/captures/{produkt['id']}/voice", headers=kopf,
                              files={"file": ("a.ogg", b"OggS-audio", "audio/ogg")})
        assert antwort.status_code == 200, antwort.text
        with sitzung() as db:
            key = db.scalar(select(VoiceRecording.storage_key).where(
                VoiceRecording.product_id == produkt["id"]))
        assert key.startswith(f"m/{TEST_MANDANT}/produkte/{produkt['id']}/sprache/")
        assert client.get(medien.signierte_url(key)).status_code == 404

    def test_unbekannte_und_boesartige_pfade(self, client, engine):
        assert client.get("/api/v1/media/gibt/es/nicht.jpg").status_code == 404
        assert client.get("/api/v1/media/../../etc/passwd").status_code == 404
        assert client.get(medien.signierte_url("../../etc/passwd")).status_code == 404


class TestFirmen:
    def test_firma_a_bekommt_keine_adressen_von_b(self, client, kopf, firma_b):  # noqa: F811
        # Bild von B liegt in der Datenbank; A sieht es in keiner Antwort und
        # kommt ohne Signatur nicht heran.
        with sitzung(MANDANT_B) as db:
            key_b = db.scalar(select(ProductImage.storage_key))
        artikel = client.get("/api/v1/products", headers=kopf).text
        assert key_b not in artikel
        assert client.get(f"/api/v1/media/{key_b}").status_code == 404

    def test_veroeffentlichung_nutzt_oeffentliche_adresse(self, monkeypatch):
        from app.config import get_settings
        monkeypatch.setattr(get_settings(), "media_public_base_url", "")
        monkeypatch.setattr(get_settings(), "domain", "lager.example.de")
        assert medien.oeffentliche_url("m/t/produkte/p/shop/a.jpg") == \
            "https://lager.example.de/api/v1/media/m/t/produkte/p/shop/a.jpg"
        monkeypatch.setattr(get_settings(), "domain", "")
        assert medien.oeffentliche_url("m/t/produkte/p/shop/a.jpg") is None
