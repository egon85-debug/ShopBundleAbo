"""Dublettenprüfung (Anforderung 13) inkl. Bestand-erhöhen-Workflow."""
from app.models import Product
from app.models.base import utcnow
from app.services import dedup_service, product_service

from tests.conftest import auth_headers


def confirmed_product(db, user, **fields):
    product = product_service.create_draft(
        db, client_capture_id=fields.pop("capture_id"), user=user)
    for key, value in fields.items():
        setattr(product, key, value)
    product.confirmed_at = utcnow()
    db.commit()
    return product


class TestDedupService:
    def test_match_by_ean(self, db, employee):
        existing = confirmed_product(db, employee, capture_id="dd-1",
                                     ean="4059952529776", product_name="GSR 12V-35")
        draft = product_service.create_draft(db, client_capture_id="dd-2", user=employee)
        draft.ean = "4059952529776"
        matches = dedup_service.find_duplicates(db, draft)
        assert [m[0].id for m in matches] == [existing.id]
        assert matches[0][1] == "Gleiche EAN"

    def test_match_by_manufacturer_model(self, db, employee):
        confirmed_product(db, employee, capture_id="dd-3",
                          manufacturer="Bosch", model="GSR 12V-35")
        draft = product_service.create_draft(db, client_capture_id="dd-4", user=employee)
        draft.manufacturer = "bosch"
        draft.model = "gsr 12v-35"
        matches = dedup_service.find_duplicates(db, draft)
        assert len(matches) == 1

    def test_similar_name(self, db, employee):
        confirmed_product(db, employee, capture_id="dd-5",
                          product_name="Bosch Professional GSR 12V-35 Akkuschrauber")
        draft = product_service.create_draft(db, client_capture_id="dd-6", user=employee)
        draft.product_name = "Bosch Professional GSR 12V-35 Akkuschrauber blau"
        matches = dedup_service.find_duplicates(db, draft)
        assert len(matches) == 1
        assert "Ähnliche" in matches[0][1]

    def test_unconfirmed_drafts_ignored(self, db, employee):
        draft_a = product_service.create_draft(db, client_capture_id="dd-7", user=employee)
        draft_a.ean = "4059952529776"
        draft_b = product_service.create_draft(db, client_capture_id="dd-8", user=employee)
        draft_b.ean = "4059952529776"
        assert dedup_service.find_duplicates(db, draft_b) == []


class TestConfirmWithDuplicates:
    def test_confirm_reports_duplicates_then_increase_stock(self, client, db, employee):
        existing = confirmed_product(db, employee, capture_id="dd-api-1",
                                     ean="4059952529776", product_name="GSR 12V-35",
                                     stock_quantity=5)
        headers = auth_headers(client)
        capture = client.post("/api/v1/captures", headers=headers,
                              json={"client_capture_id": "dd-api-2"}).json()
        draft = db.get(Product, capture["id"])
        draft.ean = "4059952529776"
        draft.stock_quantity = 3
        db.commit()

        confirm = client.post(f"/api/v1/captures/{capture['id']}/confirm",
                              headers=headers)
        assert confirm.status_code == 200
        body = confirm.json()
        assert body["status"] == "duplicate_found"
        assert body["duplicates"][0]["product_id"] == existing.id

        increase = client.post(
            f"/api/v1/captures/{capture['id']}/confirm"
            f"?duplicate_action=increase_stock&duplicate_id={existing.id}",
            headers=headers)
        assert increase.status_code == 200
        assert increase.json()["status"] == "stock_increased"
        assert increase.json()["product"]["stock_quantity"] == 8
        # Entwurf wurde entfernt
        db.expire_all()
        assert db.get(Product, capture["id"]) is None

    def test_create_anyway(self, client, db, employee):
        confirmed_product(db, employee, capture_id="dd-api-3",
                          ean="4059952529776", stock_quantity=5)
        headers = auth_headers(client)
        capture = client.post("/api/v1/captures", headers=headers,
                              json={"client_capture_id": "dd-api-4"}).json()
        draft = db.get(Product, capture["id"])
        draft.ean = "4059952529776"
        db.commit()
        response = client.post(
            f"/api/v1/captures/{capture['id']}/confirm?duplicate_action=create_anyway",
            headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "saved"
