"""Qualitätskontrolle vor Shop-Veröffentlichung (Anforderung 30):
konkrete Liste fehlender Informationen statt pauschaler Fehlermeldung."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ImageKind, Product, ProductImage, ShopListing
from app.models.product import Condition


def check_shop_ready(db: Session, product: Product,
                     connector_required_fields: list[str] | None = None) -> list[str]:
    """Liefert die Liste fehlender Angaben; leer = shopbereit."""
    missing: list[str] = []

    if not product.product_name:
        missing.append("Produktname")
    if product.sale_price is None or product.sale_price <= 0:
        missing.append("Verkaufspreis")
    if product.stock_quantity <= 0:
        missing.append("Bestand")
    if not product.category:
        missing.append("Kategorie")
    if product.condition == Condition.UNKNOWN.value:
        missing.append("Zustand")

    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    if listing is None or not listing.long_description:
        if not product.long_description:
            missing.append("Produktbeschreibung")

    optimized = db.scalar(
        select(ProductImage).where(
            ProductImage.product_id == product.id,
            ProductImage.kind == ImageKind.OPTIMIZED.value,
        ).limit(1)
    )
    if optimized is None:
        missing.append("Mindestens ein optimiertes Produktbild")

    for field in connector_required_fields or []:
        if field in ("product_name", "sale_price", "category"):
            continue  # bereits oben geprüft
        if not getattr(product, field, None):
            missing.append(f"Pflichtangabe des Shops: {field}")

    return missing
