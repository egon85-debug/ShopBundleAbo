"""Bildfreigabe: Hauptbild wählen, Optimierung ablehnen — Originale bleiben unantastbar."""
from app.models import ImageKind, Role

from tests.conftest import auth_headers, jpeg_bytes, make_user, run_all_jobs


def _artikel_mit_bildern(client, headers, capture_id="cap-bild-01"):
    """Erfassung mit zwei Fotos, Verarbeitung bis zur optimierten Fassung."""
    capture = client.post("/api/v1/captures", headers=headers,
                          json={"client_capture_id": capture_id}).json()
    for role, cid in (("front", "img-front"), ("back", "img-back")):
        response = client.post(
            f"/api/v1/captures/{capture['id']}/images", headers=headers,
            files={"file": (f"{role}.jpg", jpeg_bytes(), "image/jpeg")},
            data={"role": role, "client_image_id": cid},
        )
        assert response.status_code == 200, response.text
    run_all_jobs()
    return client.get(f"/api/v1/products/{capture['id']}", headers=headers).json()


def _optimierte(product):
    return [i for i in product["images"] if i["kind"] == ImageKind.OPTIMIZED.value]


def _originale(product):
    return [i for i in product["images"] if i["kind"] == ImageKind.ORIGINAL.value]


class TestHauptbild:
    def test_hauptbild_wechseln_setzt_das_alte_zurueck(self, client, db, employee):
        make_user(db, email="shop@example.com", role=Role.SHOP_MANAGER.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers)
        optimierte = _optimierte(product)
        assert len(optimierte) == 2
        vorher = next(i for i in optimierte if i["is_primary"])
        assert vorher["role"] == "front"
        neu = next(i for i in optimierte if not i["is_primary"])

        manager = auth_headers(client, email="shop@example.com")
        response = client.patch(
            f"/api/v1/products/{product['id']}/images/{neu['id']}",
            headers=manager, json={"is_primary": True})
        assert response.status_code == 200, response.text
        haupt = [i for i in _optimierte(response.json()) if i["is_primary"]]
        assert [i["id"] for i in haupt] == [neu["id"]]

    def test_original_kann_nicht_hauptbild_sein(self, client, db, employee):
        make_user(db, email="shop@example.com", role=Role.SHOP_MANAGER.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-02")
        original = _originale(product)[0]

        manager = auth_headers(client, email="shop@example.com")
        response = client.patch(
            f"/api/v1/products/{product['id']}/images/{original['id']}",
            headers=manager, json={"is_primary": True})
        assert response.status_code == 422

    def test_mitarbeiter_darf_nicht_freigeben(self, client, db, employee):
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-03")
        bild = _optimierte(product)[0]
        response = client.patch(
            f"/api/v1/products/{product['id']}/images/{bild['id']}",
            headers=headers, json={"sort_order": 5})
        assert response.status_code == 403


class TestAblehnen:
    def test_ablehnen_entfernt_nur_die_optimierte_fassung(self, client, db, employee):
        make_user(db, email="shop@example.com", role=Role.SHOP_MANAGER.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-04")
        assert len(_originale(product)) == 2
        abzulehnen = next(i for i in _optimierte(product) if i["role"] == "back")

        manager = auth_headers(client, email="shop@example.com")
        response = client.delete(
            f"/api/v1/products/{product['id']}/images/{abzulehnen['id']}", headers=manager)
        assert response.status_code == 200, response.text
        danach = response.json()
        # Optimierte Fassung weg, beide Originale unverändert da.
        assert [i["id"] for i in _optimierte(danach)] != [abzulehnen["id"]]
        assert abzulehnen["id"] not in {i["id"] for i in danach["images"]}
        assert len(_originale(danach)) == 2

    def test_originale_werden_nie_geloescht(self, client, db, employee):
        make_user(db, email="shop@example.com", role=Role.SHOP_MANAGER.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-05")
        original = _originale(product)[0]

        manager = auth_headers(client, email="shop@example.com")
        response = client.delete(
            f"/api/v1/products/{product['id']}/images/{original['id']}", headers=manager)
        assert response.status_code == 409
        # Und es ist wirklich noch da.
        state = client.get(f"/api/v1/products/{product['id']}", headers=manager).json()
        assert original["id"] in {i["id"] for i in state["images"]}

    def test_nach_ablehnen_des_hauptbilds_rueckt_das_naechste_nach(self, client, db, employee):
        make_user(db, email="shop@example.com", role=Role.SHOP_MANAGER.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-06")
        haupt = next(i for i in _optimierte(product) if i["is_primary"])

        manager = auth_headers(client, email="shop@example.com")
        danach = client.delete(
            f"/api/v1/products/{product['id']}/images/{haupt['id']}", headers=manager).json()
        verbleibend = _optimierte(danach)
        assert len(verbleibend) == 1
        assert verbleibend[0]["is_primary"] is True

    def test_ablehnen_steht_im_audit_log(self, client, db, employee):
        make_user(db, email="admin@example.com", role=Role.ADMIN.value)
        headers = auth_headers(client)
        product = _artikel_mit_bildern(client, headers, "cap-bild-07")
        bild = _optimierte(product)[0]

        admin = auth_headers(client, email="admin@example.com")
        client.delete(f"/api/v1/products/{product['id']}/images/{bild['id']}", headers=admin)
        log = client.get("/api/v1/audit-log?entity_type=product_image", headers=admin).json()
        assert any(e["action"] == "reject" and e["entity_id"] == bild["id"] for e in log)
