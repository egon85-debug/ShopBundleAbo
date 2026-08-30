"""Qualitätskontrolle + Shop-Publishing über einen Fake-Connector am echten Interface."""
from decimal import Decimal

from sqlalchemy import select

from app.connectors.base import ShopConnector, ShopPublishResult
from app.connectors.registry import register_connector
from app.models import (
    ImageKind,
    Product,
    ProductImage,
    ShopConnection,
    ShopPublication,
)
from app.models.base import utcnow
from app.services import product_service, quality_service

from tests.conftest import auth_headers, make_user, run_all_jobs

published_payloads: list = []


class RecordingConnector(ShopConnector):
    connector_type = "recording-test"

    def test_connection(self):
        pass

    def publish_product(self, listing):
        published_payloads.append(listing)
        return ShopPublishResult(external_id="ext-123")

    def update_product(self, external_id, listing):
        published_payloads.append(listing)

    def update_stock(self, external_id, quantity):
        published_payloads.append(("stock", external_id, quantity))

    def update_price(self, external_id, price):
        pass

    def delist_product(self, external_id):
        pass


register_connector(RecordingConnector)


def make_ready_product(db, user, sku="pub-1"):
    product = product_service.create_draft(db, client_capture_id=sku, user=user)
    product.product_name = "Bosch GSR 12V-35"
    product.category = "Elektrowerkzeug"
    product.condition = "new"
    product.sale_price = Decimal("59.00")
    product.long_description = "Beschreibung"
    product.stock_quantity = 14
    product.confirmed_at = utcnow()
    db.add(ProductImage(product_id=product.id, kind=ImageKind.OPTIMIZED.value,
                        role="front", storage_key=f"products/{product.id}/x.shop.jpg",
                        is_primary=True))
    db.commit()
    return product


class TestQuality:
    def test_missing_fields_listed(self, db, employee):
        product = product_service.create_draft(db, client_capture_id="q-pub-1",
                                               user=employee)
        missing = quality_service.check_shop_ready(db, product)
        assert "Produktname" in missing
        assert "Verkaufspreis" in missing
        assert "Bestand" in missing
        assert "Kategorie" in missing
        assert "Zustand" in missing
        assert "Produktbeschreibung" in missing
        assert "Mindestens ein optimiertes Produktbild" in missing

    def test_ready_product_passes(self, db, employee):
        product = make_ready_product(db, employee)
        assert quality_service.check_shop_ready(db, product) == []


class TestPublish:
    def test_publish_rejected_when_not_ready(self, client, db, admin, employee):
        headers = auth_headers(client, email="admin@example.com")
        product = product_service.create_draft(db, client_capture_id="pub-notready",
                                               user=employee)
        connection = ShopConnection(name="Rec", connector_type="recording-test",
                                    base_url="https://example.com")
        db.add(connection)
        db.commit()
        response = client.post(
            f"/api/v1/shop/products/{product.id}/publish?connection_id={connection.id}",
            headers=headers)
        assert response.status_code == 422
        assert "missing" in str(response.json())

    def test_publish_flow(self, client, db, admin, employee):
        published_payloads.clear()
        headers = auth_headers(client, email="admin@example.com")
        product = make_ready_product(db, employee, sku="pub-flow-1")
        connection = ShopConnection(name="Rec2", connector_type="recording-test",
                                    base_url="https://example.com")
        db.add(connection)
        db.commit()

        response = client.post(
            f"/api/v1/shop/products/{product.id}/publish?connection_id={connection.id}",
            headers=headers)
        assert response.status_code == 202, response.text
        run_all_jobs()

        db.expire_all()
        publication = db.scalar(select(ShopPublication).where(
            ShopPublication.product_id == product.id))
        assert publication.status == "published"
        assert publication.external_id == "ext-123"
        assert publication.payload_snapshot["sku"] == product.internal_sku
        assert db.get(Product, product.id).publication_status == "published"
        assert published_payloads[0].price == Decimal("59.00")
        assert published_payloads[0].stock_quantity == 14

    def test_failed_publish_keeps_product_shop_ready(self, client, db, admin, employee):
        class FailingConnector(RecordingConnector):
            connector_type = "failing-test"
            def publish_product(self, listing):
                raise RuntimeError("Shop nicht erreichbar")
        register_connector(FailingConnector)

        headers = auth_headers(client, email="admin@example.com")
        product = make_ready_product(db, employee, sku="pub-fail-1")
        connection = ShopConnection(name="Fail", connector_type="failing-test",
                                    base_url="https://example.com")
        db.add(connection)
        db.commit()
        response = client.post(
            f"/api/v1/shop/products/{product.id}/publish?connection_id={connection.id}",
            headers=headers)
        assert response.status_code == 202
        # Alle Versuche aufbrauchen
        for _ in range(10):
            run_all_jobs()
            db.expire_all()
            from app.models import Job
            job = db.scalar(select(Job).where(Job.job_type == "publish_product",
                                              Job.product_id == product.id))
            if job.status == "dead":
                break
            job.run_at = utcnow()
            db.commit()
        publication = db.scalar(select(ShopPublication).where(
            ShopPublication.product_id == product.id))
        assert publication.status == "failed"
        assert "nicht erreichbar" in publication.error
        product = db.get(Product, product.id)
        # Artikel bleibt shopbereit (Anforderung 31)
        assert product.publication_status == "publish_failed"
        assert product.processing_status == "shop_ready"
