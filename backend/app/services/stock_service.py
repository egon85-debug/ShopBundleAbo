"""Bestandsführung: JEDE Änderung läuft über apply_movement (Anforderung 17/38.10)."""
from sqlalchemy.orm import Session

from app.models import MovementType, Product, StockMovement, User
from app.services import audit_service


class StockError(Exception):
    pass


def apply_movement(
    db: Session,
    *,
    product: Product,
    movement_type: str,
    quantity_change: int,
    user: User | None,
    reason: str | None = None,
    reference: str | None = None,
) -> StockMovement:
    if movement_type not in [m.value for m in MovementType]:
        raise StockError(f"Unbekannte Bewegungsart: {movement_type}")
    if quantity_change == 0:
        raise StockError("Bestandsänderung darf nicht 0 sein")

    before = product.stock_quantity

    if movement_type in (MovementType.RESERVED.value, MovementType.RELEASED.value):
        delta = quantity_change if movement_type == MovementType.RESERVED.value else -abs(quantity_change)
        new_reserved = product.reserved_quantity + delta
        if new_reserved < 0 or new_reserved > product.stock_quantity:
            raise StockError("Reservierung übersteigt den Bestand")
        product.reserved_quantity = new_reserved
        after = before  # Gesamtbestand unverändert
    else:
        after = before + quantity_change
        if after < 0:
            raise StockError(f"Bestand würde negativ ({before} {quantity_change:+d})")
        if after < product.reserved_quantity:
            raise StockError("Bestand würde unter die reservierte Menge fallen")
        product.stock_quantity = after

    movement = StockMovement(
        product_id=product.id,
        movement_type=movement_type,
        quantity_change=quantity_change,
        quantity_before=before,
        quantity_after=after,
        reason=reason,
        reference=reference,
        user_id=user.id if user else None,
    )
    db.add(movement)
    audit_service.log(
        db, user=user, entity_type="product", entity_id=product.id, action="stock_change",
        field="stock_quantity", old_value=before, new_value=after,
        reason=reason or movement_type,
    )
    return movement
