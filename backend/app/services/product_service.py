from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Counter, Product, ProcessingStatus, User
from app.services import audit_service

# Felder, die per PATCH/Benutzereingabe geändert werden dürfen (auditiert).
EDITABLE_FIELDS = {
    "ean", "gtin", "upc", "mpn", "manufacturer", "brand", "product_name", "model",
    "short_description", "long_description", "category", "subcategory", "attributes",
    "technical_data", "condition", "packaging_condition", "purchase_price_net",
    "purchase_price_gross", "sale_price", "minimum_sale_price", "supplier_id",
    "purchase_date", "invoice_number", "storage_location_id", "batch_number",
    "serial_number", "notes",
}


def next_internal_sku(db: Session) -> str:
    """Race-sicher über row lock auf der Counter-Zeile (SQLite: Fallback ohne Lock)."""
    stmt = select(Counter).where(Counter.name == "internal_sku")
    if db.get_bind().dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    counter = db.scalar(stmt)
    if counter is None:
        counter = Counter(name="internal_sku", value=0)
        db.add(counter)
        db.flush()
    counter.value += 1
    return f"WL-{counter.value:06d}"


def create_draft(db: Session, *, client_capture_id: str, user: User) -> Product:
    """Neue Erfassung: idempotent über client_capture_id (Offline-Replays)."""
    existing = db.scalar(select(Product).where(Product.client_capture_id == client_capture_id))
    if existing:
        return existing
    product = Product(
        internal_sku=next_internal_sku(db),
        client_capture_id=client_capture_id,
        processing_status=ProcessingStatus.DRAFT.value,
        created_by=user.id,
    )
    db.add(product)
    db.flush()
    audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                      action="create", new_value=product.internal_sku)
    return product


def apply_user_update(db: Session, *, product: Product, changes: dict, user: User) -> Product:
    """Benutzeränderungen: auditiert, Quelle 'user' (hat Vorrang vor KI, Anforderung 38.6)."""
    sources = dict(product.field_sources or {})
    confidence = dict(product.field_confidence or {})
    for field, value in changes.items():
        if field not in EDITABLE_FIELDS:
            continue
        old = getattr(product, field)
        if old == value:
            continue
        setattr(product, field, value)
        sources[field] = "user"
        confidence[field] = 1.0
        audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                          action="update", field=field, old_value=old, new_value=value)
    product.field_sources = sources
    product.field_confidence = confidence
    return product


def dashboard_counts(db: Session) -> dict:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    def count(*where) -> int:
        return db.scalar(select(func.count()).select_from(Product).where(*where)) or 0
    return {
        "products_today": count(Product.created_at >= today_start),
        "products_total": count(),
        "review_required": count(Product.processing_status == ProcessingStatus.REVIEW_REQUIRED.value),
        "shop_ready": count(Product.processing_status == ProcessingStatus.SHOP_READY.value),
        "published": count(Product.publication_status == "published"),
    }
