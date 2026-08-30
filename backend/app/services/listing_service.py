"""Shoptext-Erzeugung (Anforderung 15): Der LLM-Prompt erhält verifizierte und
unverifizierte Felder getrennt; unverifizierte dürfen nicht als Fakten erscheinen."""
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Product, ShopListing
from app.models.base import utcnow
from app.providers.registry import get_llm

_TEXT_FIELDS = [
    "product_name", "manufacturer", "brand", "model", "mpn", "ean", "category",
    "subcategory", "condition", "packaging_condition", "notes",
]


def split_fields(product: Product) -> tuple[dict, dict]:
    """Verifiziert = Quelle user/research oder Confidence ≥ Schwellwert."""
    threshold = get_settings().confidence_threshold
    sources = product.field_sources or {}
    confidence = product.field_confidence or {}
    verified: dict = {}
    unverified: dict = {}
    for field in _TEXT_FIELDS:
        value = getattr(product, field, None)
        if value in (None, "", {}):
            continue
        if sources.get(field) in ("user", "research") or confidence.get(field, 0.0) >= threshold:
            verified[field] = value
        else:
            unverified[field] = value
    for name, data in (("attributes", product.attributes), ("technical_data", product.technical_data)):
        if data:
            (verified if sources.get(name) in ("user", "research") else unverified)[name] = data
    return verified, unverified


def generate(db: Session, product: Product) -> ShopListing:
    verified, unverified = split_fields(product)
    generation = get_llm().generate_shop_text(verified, unverified)

    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    if listing is None:
        listing = ShopListing(product_id=product.id)
        db.add(listing)

    listing.seo_title = generation.seo_title[:255]
    listing.short_description = generation.short_description
    listing.long_description = generation.long_description
    listing.bullet_points = generation.bullet_points[:6]
    listing.scope_of_delivery = generation.scope_of_delivery
    listing.condition_note = generation.condition_note
    listing.meta_title = generation.meta_title[:255]
    listing.meta_description = generation.meta_description[:500]
    # Slug immer serverseitig normalisieren — LLM-Ausgabe nie ungeprüft übernehmen.
    listing.url_slug = slugify(generation.url_slug or generation.seo_title)[:255]
    listing.tags = generation.tags[:10]
    listing.suggested_price = product.recommended_sale_price
    listing.generated_at = utcnow()
    return listing
