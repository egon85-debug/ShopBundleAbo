"""Mandantentrennung im Anwendungscode (SQLite, läuft bei jedem Testlauf).

Aufbau: zwei Firmen A und B mit absichtlich gleich benannten Daten (gleiche
SKU, gleicher Lieferant). Mit den Zugängen von A wird versucht, an Daten von B
zu kommen. Die Absicherung in der Datenbank selbst (Row Level Security) prüft
`test_mandanten_postgres.py` gegen eine echte PostgreSQL.
"""
import hashlib
import hmac
import json
import re

import pytest
from sqlalchemy import func, select

from app.jobs import queue
from app.jobs.worker import Worker
from app.main import app
from app.models import (
    Job,
    JobStatus,
    Membership,
    Product,
    ProductImage,
    Role,
    ShopConnection,
    ShopListing,
    StockMovement,
    Supplier,
    Tenant,
    User,
)
from app.services import auth_service, product_service, stock_service
from app.tenancy import KeinMandant, mandant_setzen
from tests.conftest import TEST_MANDANT, auth_headers, make_user, neuer_mandant, sitzung

MANDANT_B = "20000000-0000-4000-8000-000000000002"
GEHEIM = "GEHEIM-FIRMA-B"
PASSWORT = "test-passwort-123"


@pytest.fixture()
def firma_b(engine):
    """Firma B mit eigenem Admin, Artikel, Bild, Shoptext, Verbindung, Auftrag."""
    with sitzung(TEST_MANDANT) as db:
        neuer_mandant(db, tenant_id=MANDANT_B, kurzname="firma-b", name="Firma B",
                      sku_praefix="WL")
    db = sitzung(MANDANT_B)
    admin_b = auth_service.create_user(db, email="admin-b@example.com", password=PASSWORT,
                                       display_name="Admin B", role=Role.ADMIN.value)
    lieferant = Supplier(name="Müller Großhandel", notes=GEHEIM)
    db.add(lieferant)
    produkt = product_service.create_draft(db, client_capture_id="gleiche-erfassung",
                                           user=admin_b)
    produkt.product_name = GEHEIM
    produkt.supplier = lieferant
    db.flush()
    stock_service.apply_movement(db, product=produkt, movement_type="inbound",
                                 quantity_change=10, user=admin_b)
    bild = ProductImage(product_id=produkt.id, storage_key=f"b/{produkt.id}.jpg")
    db.add(bild)
    db.add(ShopListing(product_id=produkt.id, seo_title=GEHEIM))
    verbindung = ShopConnection(name="Shop", connector_type="winterfeld",
                                base_url="https://b.example", webhook_secret="geheim-b")
    db.add(verbindung)
    db.flush()
    job = queue.enqueue(db, job_type="recognize_product", product_id=produkt.id,
                        payload={"product_id": produkt.id})
    db.commit()
    ids = {
        "tenant_id": MANDANT_B, "product_id": produkt.id, "capture_id": produkt.id,
        "image_id": bild.id, "supplier_id": lieferant.id, "connection_id": verbindung.id,
        "job_id": job.id, "user_id": admin_b.id, "sku": produkt.internal_sku,
    }
    db.close()
    return ids


@pytest.fixture()
def firma_a(engine):
    """Firma A (Testmandant) mit Admin und einem Artikel mit derselben SKU wie B."""
    db = sitzung(TEST_MANDANT)
    admin_a = make_user(db, email="admin-a@example.com", role=Role.ADMIN.value)
    db.add(Supplier(name="Müller Großhandel"))
    produkt = product_service.create_draft(db, client_capture_id="gleiche-erfassung",
                                           user=admin_a)
    produkt.product_name = "Artikel von A"
    stock_service.apply_movement(db, product=produkt, movement_type="inbound",
                                 quantity_change=5, user=admin_a)
    db.commit()
    ids = {"product_id": produkt.id, "sku": produkt.internal_sku, "user_id": admin_a.id}
    db.close()
    return ids


@pytest.fixture()
def kopf_a(client, firma_a):
    return auth_headers(client, email="admin-a@example.com")


# ── Gleiche Namen in verschiedenen Firmen ──────────────────────────────────

class TestEindeutigJeFirma:
    def test_gleiche_sku_lieferant_und_erfassung_in_zwei_firmen(self, firma_a, firma_b):
        assert firma_a["sku"] == firma_b["sku"] == "WL-000001"
        with sitzung(TEST_MANDANT) as db:
            assert db.scalar(select(func.count()).select_from(Supplier)) == 1

    def test_sku_praefix_je_firma(self, engine):
        with sitzung(TEST_MANDANT) as db:
            neuer_mandant(db, tenant_id=MANDANT_B, kurzname="firma-b", sku_praefix="FB")
        with sitzung(MANDANT_B) as db:
            assert product_service.next_internal_sku(db) == "FB-000001"


# ── Abfragen sehen nur die eigene Firma ────────────────────────────────────

class TestSitzung:
    def test_sitzung_sieht_nur_eigene_zeilen(self, firma_a, firma_b):
        with sitzung(TEST_MANDANT) as db:
            namen = db.scalars(select(Product.product_name)).all()
            assert namen == ["Artikel von A"]
            assert db.get(Product, firma_b["product_id"]) is None
            assert db.scalar(select(func.count()).select_from(StockMovement)) == 1

    def test_ohne_mandant_sieht_man_nichts(self, firma_a, firma_b):
        with sitzung(None) as db:
            assert db.scalars(select(Product)).all() == []
            assert db.scalar(select(func.count()).select_from(Job)) == 0

    def test_speichern_ohne_mandant_wird_verweigert(self, engine):
        with sitzung(None) as db:
            db.add(Supplier(name="Irgendwer"))
            with pytest.raises(KeinMandant):
                db.flush()

    def test_fremden_mandanten_eintragen_wird_verweigert(self, firma_b):
        with sitzung(TEST_MANDANT) as db:
            db.add(Supplier(name="Unterschoben", tenant_id=MANDANT_B))
            with pytest.raises(KeinMandant):
                db.flush()

    def test_nachladen_von_beziehungen_bleibt_in_der_firma(self, firma_a, firma_b):
        with sitzung(TEST_MANDANT) as db:
            produkt = db.get(Product, firma_a["product_id"])
            assert produkt.images == []

    def test_massen_aenderung_trifft_nur_eigene_firma(self, firma_a, firma_b):
        from sqlalchemy import update
        with sitzung(TEST_MANDANT) as db:
            db.execute(update(Product).values(notes="überschrieben")
                       .execution_options(synchronize_session=False))
            db.commit()
        with sitzung(MANDANT_B) as db:
            assert db.get(Product, firma_b["product_id"]).notes is None


# ── API: jede Route mit Kennung prüfen ─────────────────────────────────────

def _routen_mit_kennung():
    for pfad, operationen in app.openapi()["paths"].items():
        for methode, operation in operationen.items():
            parameter = [p["name"] for p in operation.get("parameters", [])]
            if any(p.endswith("_id") for p in parameter):
                yield pfad, methode, parameter


ROUTEN = sorted(_routen_mit_kennung())


def test_routenliste_ist_nicht_leer():
    # Schützt davor, dass der Test unbemerkt nichts mehr prüft.
    assert len(ROUTEN) >= 20


@pytest.mark.parametrize(("pfad", "methode", "parameter"), ROUTEN,
                         ids=[f"{m.upper()} {p}" for p, m, _ in ROUTEN])
def test_fremde_kennungen_liefern_nichts(client, kopf_a, firma_b, pfad, methode, parameter):
    """Firma A setzt in jede Route die Kennungen von Firma B ein.

    Erwartet: Steht die Kennung im Pfad, nie ein Erfolg (2xx). Dient sie nur als
    Filter (z. B. Audit-Log nach Datensatz), darf die Antwort erfolgreich, aber
    nicht mit Daten von B gefüllt sein. In keiner Antwort taucht Inhalt oder
    eine Kennung von B auf. Webhooks sind absichtlich ohne Anmeldung; bei ihnen
    schützt die Signatur, die A nicht kennt (401).
    """
    url = re.sub(r"\{(\w+)\}", lambda m: firma_b.get(m.group(1), "x"), pfad)
    query = {p: firma_b[p] for p in parameter if p in firma_b and "{" + p + "}" not in pfad}
    antwort = client.request(methode.upper(), url, params=query, headers=kopf_a, json={})
    if "_id}" in pfad:
        assert not 200 <= antwort.status_code < 300, (antwort.status_code, antwort.text[:300])
    assert GEHEIM not in antwort.text
    fremde = [firma_b[k] for k in ("product_id", "image_id", "supplier_id", "connection_id",
                                   "job_id", "user_id")]
    antworttext = antwort.text
    for kennung in fremde:
        # Die eingesetzte Kennung darf in einer Fehlermeldung vorkommen, nicht in Daten.
        if 200 <= antwort.status_code < 300:
            assert kennung not in antworttext, (pfad, kennung)


class TestApi:
    def test_listen_zeigen_nur_eigene_firma(self, client, kopf_a, firma_b):
        produkte = client.get("/api/v1/products", headers=kopf_a).json()
        texte = json.dumps(produkte)
        assert GEHEIM not in texte
        benutzer = client.get("/api/v1/users", headers=kopf_a).json()
        assert [b["email"] for b in benutzer] == ["admin-a@example.com"]
        protokoll = client.get("/api/v1/audit-log", headers=kopf_a).json()
        assert all(e["entity_id"] != firma_b["product_id"] for e in protokoll)
        auftraege = client.get("/api/v1/jobs", headers=kopf_a).json()
        assert all(j["id"] != firma_b["job_id"] for j in auftraege)

    def test_fremdes_produkt_aendern_scheitert(self, client, kopf_a, firma_b):
        antwort = client.patch(f"/api/v1/products/{firma_b['product_id']}",
                               json={"notes": "von A"}, headers=kopf_a)
        assert antwort.status_code == 404
        antwort = client.post(f"/api/v1/products/{firma_b['product_id']}/stock-movements",
                              json={"movement_type": "manual_correction",
                                    "quantity_change": -3, "reason": "Test"},
                              headers=kopf_a)
        assert antwort.status_code == 404
        with sitzung(MANDANT_B) as db:
            produkt = db.get(Product, firma_b["product_id"])
            assert produkt.notes is None and produkt.stock_quantity == 10

    def test_fremdes_konto_aendern_scheitert(self, client, kopf_a, firma_b):
        antwort = client.patch(f"/api/v1/users/{firma_b['user_id']}",
                               json={"password": "uebernommen-123", "role": "admin"},
                               headers=kopf_a)
        assert antwort.status_code == 404
        assert client.post("/api/v1/auth/login", json={
            "email": "admin-b@example.com", "password": PASSWORT}).status_code == 200

    def test_mit_fremder_verbindung_veroeffentlichen_scheitert(self, client, kopf_a,
                                                               firma_a, firma_b):
        antwort = client.post(f"/api/v1/shop/products/{firma_a['product_id']}/publish",
                              params={"connection_id": firma_b["connection_id"]},
                              headers=kopf_a)
        assert antwort.status_code == 404


# ── Anmeldung ──────────────────────────────────────────────────────────────

class TestAnmeldung:
    def _zweite_mitgliedschaft(self, firma_a, firma_b):
        with sitzung(MANDANT_B) as db:
            db.add(Membership(user_id=firma_a["user_id"], tenant_id=MANDANT_B,
                              role=Role.EMPLOYEE.value))
            db.commit()

    def test_konto_mit_zwei_firmen_muss_waehlen(self, client, firma_a, firma_b):
        self._zweite_mitgliedschaft(firma_a, firma_b)
        antwort = client.post("/api/v1/auth/login", json={
            "email": "admin-a@example.com", "password": PASSWORT})
        assert antwort.status_code == 409
        kurznamen = {m["kurzname"] for m in antwort.json()["detail"]["mandanten"]}
        assert kurznamen == {"test", "firma-b"}

    def test_rolle_gilt_je_firma(self, client, firma_a, firma_b):
        self._zweite_mitgliedschaft(firma_a, firma_b)
        antwort = client.post("/api/v1/auth/login", json={
            "email": "admin-a@example.com", "password": PASSWORT, "mandant": "firma-b"})
        assert antwort.status_code == 200
        kopf = {"Authorization": f"Bearer {antwort.json()['access_token']}"}
        ich = client.get("/api/v1/auth/me", headers=kopf).json()
        assert ich["role"] == Role.EMPLOYEE.value
        # In Firma B nur Mitarbeiter: keine Benutzerverwaltung.
        assert client.get("/api/v1/users", headers=kopf).status_code == 403
        # Die Erneuerung bleibt bei Firma B.
        neu = client.post("/api/v1/auth/refresh",
                          json={"refresh_token": antwort.json()["refresh_token"]}).json()
        kopf = {"Authorization": f"Bearer {neu['access_token']}"}
        assert client.get("/api/v1/auth/me", headers=kopf).json()["role"] == "employee"

    def test_admin_darf_kennwort_eines_mehrfach_mitglieds_nicht_aendern(
            self, client, kopf_a, firma_a, firma_b):
        with sitzung(TEST_MANDANT) as db:
            db.add(Membership(user_id=firma_b["user_id"], tenant_id=TEST_MANDANT,
                              role=Role.EMPLOYEE.value))
            db.commit()
        antwort = client.patch(f"/api/v1/users/{firma_b['user_id']}",
                               json={"password": "uebernommen-123"}, headers=kopf_a)
        assert antwort.status_code == 409

    def test_entzogene_mitgliedschaft_wirkt_sofort(self, client, kopf_a, firma_a):
        with sitzung(TEST_MANDANT) as db:
            m = db.scalar(select(Membership).where(Membership.user_id == firma_a["user_id"]))
            m.is_active = False
            db.commit()
        assert client.get("/api/v1/auth/me", headers=kopf_a).status_code == 401

    def test_alte_tokens_ohne_firma_gelten_nicht(self, client, firma_a):
        from app.utils.security import create_access_token
        import jwt
        from app.config import get_settings
        token = create_access_token(firma_a["user_id"], "admin", TEST_MANDANT)
        daten = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        del daten["tid"]
        alt = jwt.encode(daten, get_settings().jwt_secret, algorithm="HS256")
        antwort = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {alt}"})
        assert antwort.status_code == 401


# ── Webhooks ───────────────────────────────────────────────────────────────

class TestWebhook:
    def test_verkauf_bucht_nur_in_der_firma_der_verbindung(self, client, firma_a, firma_b):
        body = json.dumps({"order_id": "B-1", "items": [
            {"sku": firma_b["sku"], "quantity": 2}]}).encode()
        signatur = hmac.new(b"geheim-b", body, hashlib.sha256).hexdigest()
        antwort = client.post(f"/api/v1/shop/webhooks/{firma_b['connection_id']}/order",
                              content=body, headers={"X-Webhook-Signature": signatur,
                                                     "Content-Type": "application/json"})
        assert antwort.status_code == 200, antwort.text
        with sitzung(MANDANT_B) as db:
            assert db.get(Product, firma_b["product_id"]).stock_quantity == 8
        with sitzung(TEST_MANDANT) as db:
            assert db.get(Product, firma_a["product_id"]).stock_quantity == 5

    def test_unbekannte_verbindung(self, client, engine):
        antwort = client.post("/api/v1/shop/webhooks/gibt-es-nicht/order", content=b"{}")
        assert antwort.status_code == 404


# ── Warteschlange ──────────────────────────────────────────────────────────

class TestFaireWarteschlange:
    def _auftraege(self, tenant_id, anzahl):
        with sitzung(tenant_id) as db:
            for _ in range(anzahl):
                queue.enqueue(db, job_type="cleanup_voice")
            db.commit()

    def test_kleine_firma_kommt_trotz_langer_schlange_dran(self, engine):
        from tests.conftest import sitzung as s
        with s() as db:
            neuer_mandant(db, tenant_id=MANDANT_B, kurzname="firma-b")
        self._auftraege(TEST_MANDANT, 30)
        self._auftraege(MANDANT_B, 1)
        from app.tenancy import plattform_sitzung
        reihenfolge = []
        with plattform_sitzung() as db:
            for _ in range(3):
                job = queue.claim_next(db, "w")
                reihenfolge.append(job.tenant_id)
                queue.mark_done(db, job)
        assert MANDANT_B in reihenfolge[:2]

    def test_hoechstens_n_gleichzeitig_je_firma(self, engine, monkeypatch):
        from app.config import get_settings
        monkeypatch.setattr(get_settings(), "job_max_parallel_je_mandant", 2)
        self._auftraege(TEST_MANDANT, 5)
        from app.tenancy import plattform_sitzung
        with plattform_sitzung() as db:
            assert queue.claim_next(db, "w1") is not None
            assert queue.claim_next(db, "w2") is not None
            assert queue.claim_next(db, "w3") is None

    def test_worker_fuehrt_im_mandanten_des_auftrags_aus(self, engine, firma_b):
        gesehen = []

        def handler(db, job):
            gesehen.append((job.tenant_id, db.scalars(select(Product.product_name)).all()))

        from app.jobs import handlers
        alt = handlers.HANDLERS["recognize_product"]
        handlers.HANDLERS["recognize_product"] = handler
        try:
            assert Worker("w").process_one() is True
        finally:
            handlers.HANDLERS["recognize_product"] = alt
        assert gesehen == [(MANDANT_B, [GEHEIM])]
        with sitzung(MANDANT_B) as db:
            assert db.get(Job, firma_b["job_id"]).status == JobStatus.DONE.value
