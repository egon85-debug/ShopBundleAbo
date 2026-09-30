"""Änderungen aus dem Shop-Admin ins Lager übernehmen.

Der Winterfeldt-Shop schickt sie signiert an /shop/webhooks/{id}/product.
Abbildung spiegelbildlich zu connectors/winterfeld.py: Was dort aus dem
Shoptext (Listing) in den Shop geht, wird hier wieder dorthin geschrieben,
damit die nächste Veröffentlichung die Änderung nicht überschreibt.
"""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, PublicationStatus, ShopConnection, ShopListing, ShopPublication
from app.models.shop import PublicationStatusEnum
from app.services import audit_service, product_service

AKTIONEN = {"update", "activate", "deactivate", "delete"}

# Shopfeld → Feld im Listing (Shoptext); ohne Listing → Feld am Artikel.
_LISTING = {
    "name": ("seo_title", "product_name"),
    "shortDescription": ("short_description", "short_description"),
    "description": ("long_description", "long_description"),
    "seoTitle": ("meta_title", None),
    "seoDescription": ("meta_description", None),
}


def anwenden(db: Session, *, product: Product, connection: ShopConnection,
             aktion: str, aenderungen: dict) -> list[str]:
    """Übernimmt die Änderung; liefert die geänderten Lagerfelder."""
    publikationen = db.scalars(select(ShopPublication).where(
        ShopPublication.product_id == product.id,
        ShopPublication.connection_id == connection.id)).all()
    if aktion == "update":
        return _felder(db, product, aenderungen)

    if aktion == "activate":
        for pub in publikationen:
            if pub.external_id:
                pub.status = PublicationStatusEnum.PUBLISHED.value
        product.publication_status = PublicationStatus.PUBLISHED.value
    else:  # deactivate / delete
        for pub in publikationen:
            pub.status = PublicationStatusEnum.DELISTED.value
            if aktion == "delete":
                # Im Shop gibt es den Artikel nicht mehr; eine neue Veröffentlichung legt ihn neu an.
                pub.external_id = None
        product.publication_status = PublicationStatus.READY.value
    audit_service.log(db, user=None, entity_type="product", entity_id=product.id,
                      action=f"shop_{aktion}", new_value=f"Shop-Admin ({connection.name})")
    return ["publication_status"]


def _felder(db: Session, product: Product, aenderungen: dict) -> list[str]:
    geaendert: list[str] = []
    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    produkt_felder: dict = {}

    for shopfeld, (listing_feld, produkt_feld) in _LISTING.items():
        if shopfeld not in aenderungen:
            continue
        wert = _text(aenderungen[shopfeld])
        if listing is not None:
            if getattr(listing, listing_feld) != wert:
                alt = getattr(listing, listing_feld)
                setattr(listing, listing_feld, wert)
                audit_service.log(db, user=None, entity_type="shop_listing", entity_id=listing.id,
                                  action="update", field=listing_feld, old_value=alt,
                                  new_value=wert)
                geaendert.append(listing_feld)
        elif produkt_feld:
            produkt_felder[produkt_feld] = wert

    if "priceCents" in aenderungen:
        try:
            cents = int(aenderungen["priceCents"])
        except (TypeError, ValueError):
            raise ValueError("priceCents muss eine ganze Zahl sein")
        if cents <= 0:
            raise ValueError("priceCents muss größer als 0 sein")
        produkt_felder["sale_price"] = (Decimal(cents) / 100).quantize(Decimal("0.01"))

    for feld, wert in produkt_felder.items():
        if getattr(product, feld) != wert:
            geaendert.append(feld)
    if produkt_felder:
        # Quelle „user“ – Angaben aus dem Shop-Admin haben Vorrang vor der KI.
        product_service.apply_user_update(db, product=product, changes=produkt_felder, user=None)
    return geaendert


def _text(wert) -> str | None:
    if wert is None:
        return None
    text = str(wert).strip()
    return text or None

