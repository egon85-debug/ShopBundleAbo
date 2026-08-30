"""Shop-Veröffentlichung: Payload aus Produkt + Listing + optimierten Bildern bauen
und über den Connector veröffentlichen. Jede Veröffentlichung wird protokolliert."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import ShopListingPayload
from app.connectors.registry import build_connector
from app.models import (
    ImageKind,
    Product,
    ProductImage,
    PublicationStatus,
    PublicationStatusEnum,
    ShopConnection,
    ShopListing,
    ShopPublication,
)
from app.models.base import utcnow
from app.providers.registry import get_storage


class PublishError(Exception):
    pass


def build_payload(db: Session, product: Product) -> ShopListingPayload:
    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    storage = get_storage()
    images = db.scalars(
        select(ProductImage)
        .where(ProductImage.product_id == product.id,
               ProductImage.kind == ImageKind.OPTIMIZED.value)
        .order_by(ProductImage.is_primary.desc(), ProductImage.sort_order)
    ).all()
    image_urls = [url for url in (storage.public_url(i.storage_key) for i in images) if url]

    if product.sale_price is None:
        raise PublishError("Kein Verkaufspreis gesetzt")

    return ShopListingPayload(
        sku=product.internal_sku,
        title=(listing.seo_title if listing and listing.seo_title else product.product_name) or "",
        short_description=(listing.short_description if listing else None)
        or product.short_description or "",
        long_description=(listing.long_description if listing else None)
        or product.long_description or "",
        price=product.sale_price,
        stock_quantity=product.available_quantity,
        condition=product.condition,
        category=product.category,
        ean=product.ean,
        image_urls=image_urls,
        bullet_points=list(listing.bullet_points) if listing else [],
        tags=list(listing.tags) if listing else [],
        url_slug=listing.url_slug if listing else None,
        meta_title=listing.meta_title if listing else None,
        meta_description=listing.meta_description if listing else None,
        attributes=dict(product.attributes or {}),
    )


def execute_publication(db: Session, publication: ShopPublication) -> None:
    """Wird vom Background-Job aufgerufen. Wirft bei Fehlern (→ Retry)."""
    product = db.get(Product, publication.product_id)
    connection = db.get(ShopConnection, publication.connection_id)
    if product is None or connection is None or not connection.is_active:
        raise PublishError("Produkt oder Shop-Verbindung nicht verfügbar")

    connector = build_connector(connection)
    payload = build_payload(db, product)
    publication.payload_snapshot = _snapshot(payload)

    if publication.external_id:
        connector.update_product(publication.external_id, payload)
        result_id = publication.external_id
    else:
        result = connector.publish_product(payload)
        result_id = result.external_id

    publication.external_id = result_id
    publication.status = PublicationStatusEnum.PUBLISHED.value
    publication.published_at = utcnow()
    publication.error = None
    product.publication_status = PublicationStatus.PUBLISHED.value
    product.processing_status = "published"


def _snapshot(payload: ShopListingPayload) -> dict:
    return {
        "sku": payload.sku,
        "title": payload.title,
        "price": str(payload.price),
        "stock_quantity": payload.stock_quantity,
        "condition": payload.condition,
        "category": payload.category,
        "ean": payload.ean,
        "image_urls": payload.image_urls,
        "url_slug": payload.url_slug,
    }
