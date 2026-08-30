"""Bestandsführung: kein Bestandswechsel ohne Movement + Audit; Validierungen."""
import pytest

from app.models import AuditLog, MovementType, Product, StockMovement
from app.services import product_service, stock_service
from sqlalchemy import select

from tests.conftest import make_user


@pytest.fixture()
def product(db, employee):
    product = product_service.create_draft(db, client_capture_id="stock-test-1",
                                           user=employee)
    db.commit()
    return product


class TestStockService:
    def test_inbound_creates_movement_and_audit(self, db, product, employee):
        stock_service.apply_movement(db, product=product,
                                     movement_type=MovementType.INBOUND.value,
                                     quantity_change=14, user=employee,
                                     reason="Wareneingang")
        db.commit()
        assert product.stock_quantity == 14
        movement = db.scalar(select(StockMovement))
        assert (movement.quantity_before, movement.quantity_after) == (0, 14)
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "stock_change"))
        assert audit is not None
        assert audit.old_value == "0" and audit.new_value == "14"
        assert audit.user_id == employee.id

    def test_negative_stock_rejected(self, db, product, employee):
        with pytest.raises(stock_service.StockError):
            stock_service.apply_movement(db, product=product,
                                         movement_type=MovementType.SALE.value,
                                         quantity_change=-1, user=employee)

    def test_zero_change_rejected(self, db, product, employee):
        with pytest.raises(stock_service.StockError):
            stock_service.apply_movement(db, product=product,
                                         movement_type=MovementType.INBOUND.value,
                                         quantity_change=0, user=employee)

    def test_reservation_does_not_change_total(self, db, product, employee):
        stock_service.apply_movement(db, product=product,
                                     movement_type=MovementType.INBOUND.value,
                                     quantity_change=10, user=employee)
        stock_service.apply_movement(db, product=product,
                                     movement_type=MovementType.RESERVED.value,
                                     quantity_change=3, user=employee)
        assert product.stock_quantity == 10
        assert product.reserved_quantity == 3
        assert product.available_quantity == 7

    def test_over_reservation_rejected(self, db, product, employee):
        stock_service.apply_movement(db, product=product,
                                     movement_type=MovementType.INBOUND.value,
                                     quantity_change=2, user=employee)
        with pytest.raises(stock_service.StockError):
            stock_service.apply_movement(db, product=product,
                                         movement_type=MovementType.RESERVED.value,
                                         quantity_change=5, user=employee)

    def test_unknown_movement_type_rejected(self, db, product, employee):
        with pytest.raises(stock_service.StockError):
            stock_service.apply_movement(db, product=product,
                                         movement_type="teleport",
                                         quantity_change=1, user=employee)


class TestOrderWebhook:
    def test_sale_via_webhook(self, client, db, employee):
        from app.models import ShopConnection
        connection = ShopConnection(name="Testshop", connector_type="woocommerce",
                                    base_url="https://shop.example")
        db.add(connection)
        product = product_service.create_draft(db, client_capture_id="webhook-test-1",
                                               user=employee)
        stock_service.apply_movement(db, product=product,
                                     movement_type=MovementType.INBOUND.value,
                                     quantity_change=14, user=employee)
        db.commit()

        response = client.post(
            f"/api/v1/shop/webhooks/{connection.id}/order",
            json={"order_id": "1001",
                  "items": [{"sku": product.internal_sku, "quantity": 1}]})
        assert response.status_code == 200
        assert response.json()["results"][0]["new_stock"] == 13
        db.expire_all()
        movement = db.scalar(select(StockMovement).where(
            StockMovement.movement_type == "sale"))
        assert movement.reference == "1001"
        assert movement.quantity_change == -1
