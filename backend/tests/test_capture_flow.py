"""Integrationstest des Kern-Workflows: Foto → KI → Sprache → Merge → Rückfragen →
Bestätigen → Bestand/Movements → Shoptext → Bilder. Provider sind Test-Doubles."""
from tests.conftest import auth_headers, jpeg_bytes, run_all_jobs


def start_capture(client, headers, capture_id="cap-flow-0001"):
    response = client.post("/api/v1/captures", headers=headers,
                           json={"client_capture_id": capture_id})
    assert response.status_code == 201
    return response.json()


class TestCaptureFlow:
    def test_capture_is_idempotent(self, client, employee):
        headers = auth_headers(client)
        first = start_capture(client, headers)
        again = client.post("/api/v1/captures", headers=headers,
                            json={"client_capture_id": "cap-flow-0001"})
        assert again.status_code == 201
        assert again.json()["id"] == first["id"]
        assert again.json()["internal_sku"] == first["internal_sku"]

    def test_full_flow(self, client, db, employee):
        headers = auth_headers(client)
        capture = start_capture(client, headers)
        assert capture["internal_sku"].startswith("WL-")

        # 1. Foto → startet Erkennung
        upload = client.post(
            f"/api/v1/captures/{capture['id']}/images", headers=headers,
            files={"file": ("front.jpg", jpeg_bytes(), "image/jpeg")},
            data={"role": "front", "client_image_id": "img-0001"},
        )
        assert upload.status_code == 200, upload.text

        # 2. Sprache (On-Device-Transkript)
        voice = client.post(
            f"/api/v1/captures/{capture['id']}/voice", headers=headers,
            data={"transcript": "Davon haben wir 14 Stück, Einkauf 28,50 netto bei "
                                "Müller Großhandel, Lagerplatz Halle zwei Regal B vier."},
        )
        assert voice.status_code == 200, voice.text

        # 3. Hintergrundverarbeitung (Vision, Recherche, Preise, Extraktion, Bilder, Text)
        processed = run_all_jobs()
        assert processed >= 5

        state = client.get(f"/api/v1/captures/{capture['id']}", headers=headers).json()
        assert state["manufacturer"] == "Bosch"
        assert state["ean"] == "4059952529776"
        assert state["stock_quantity"] == 14
        assert state["purchase_price_net"] == "28.50"
        assert state["sale_price"] == "59.00"
        assert state["supplier_name"] == "Müller Großhandel"
        assert state["condition"] == "new"
        # Confidence + Provenienz vorhanden (Recherche bestätigt die Foto-EAN)
        assert state["field_confidence"]["ean"] >= 0.9
        assert state["field_sources"]["product_name"] in ("ai", "research")
        # Preisrecherche: nur vergleichbare Angebote (3 von 5; Pack + Gebraucht raus)
        assert state["lowest_market_price"] == "59.90"
        assert state["highest_market_price"] == "64.50"
        # Transkript gespeichert
        assert "Müller Großhandel" in state["voice_transcript"]
        # Shoptext generiert
        listing = client.get(f"/api/v1/shop/products/{capture['id']}/listing",
                             headers=headers)
        assert listing.status_code == 200
        assert "GSR 12V-35" in listing.json()["seo_title"]
        # Bilder: Original + optimiert, Original unangetastet
        kinds = {i["kind"] for i in state["images"]}
        assert kinds == {"original", "optimized"}

        # 4. Bestätigen → Wareneingang-Movement statt Direktbestand
        confirm = client.post(f"/api/v1/captures/{capture['id']}/confirm",
                              headers=headers)
        assert confirm.status_code == 200, confirm.text
        assert confirm.json()["status"] == "saved"
        product = confirm.json()["product"]
        assert product["stock_quantity"] == 14

        movements = client.get(
            f"/api/v1/products/{capture['id']}/stock-movements", headers=headers).json()
        assert len(movements) == 1
        assert movements[0]["movement_type"] == "inbound"
        assert movements[0]["quantity_before"] == 0
        assert movements[0]["quantity_after"] == 14

        # Preis-Historie hat einen Lauf
        history = client.get(
            f"/api/v1/products/{capture['id']}/price-history", headers=headers).json()
        assert len(history) == 1
        assert history[0]["comparable_count"] == 3

    def test_duplicate_image_upload_is_idempotent(self, client, db, employee):
        headers = auth_headers(client)
        capture = start_capture(client, headers, "cap-dup-img-01")
        for _ in range(2):
            response = client.post(
                f"/api/v1/captures/{capture['id']}/images", headers=headers,
                files={"file": ("front.jpg", jpeg_bytes(), "image/jpeg")},
                data={"role": "front", "client_image_id": "img-same"},
            )
            assert response.status_code == 200
        state = client.get(f"/api/v1/captures/{capture['id']}", headers=headers).json()
        assert len([i for i in state["images"] if i["kind"] == "original"]) == 1

    def test_invalid_image_type_rejected(self, client, employee):
        headers = auth_headers(client)
        capture = start_capture(client, headers, "cap-badtype-01")
        response = client.post(
            f"/api/v1/captures/{capture['id']}/images", headers=headers,
            files={"file": ("x.exe", b"MZ...", "application/octet-stream")},
        )
        assert response.status_code == 415


class TestAnswers:
    def test_stock_question_and_answer(self, client, db, employee):
        from app.models import Product
        headers = auth_headers(client)
        capture = start_capture(client, headers, "cap-answer-01")
        product = db.get(Product, capture["id"])
        from app.services import questions_service
        product.open_questions = questions_service.build_questions(product, [])
        db.commit()
        question = next(q for q in product.open_questions
                        if q["field"] == "stock_quantity")

        response = client.post(
            f"/api/v1/captures/{capture['id']}/answers", headers=headers,
            json={"answers": [{"question_id": question["id"],
                               "field": "stock_quantity", "value": 8}]})
        assert response.status_code == 200
        body = response.json()
        assert body["stock_quantity"] == 8
        assert body["field_sources"]["stock_quantity"] == "user"
        assert all(q["id"] != question["id"] for q in body["open_questions"])

    def test_invalid_ean_answer_rejected(self, client, employee):
        headers = auth_headers(client)
        capture = start_capture(client, headers, "cap-answer-02")
        response = client.post(
            f"/api/v1/captures/{capture['id']}/answers", headers=headers,
            json={"answers": [{"field": "ean", "value": "4006381333932"}]})
        assert response.status_code == 422
