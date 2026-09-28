"""Shop: Verbindungen (Admin), Listings, Vorschau, Veröffentlichung, Bestell-Webhook."""
import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.connectors.registry import available_connector_types, build_connector
from app.db import get_db
from app.jobs import queue
from app.models import (
    JobType,
    MovementType,
    Product,
    ProcessingStatus,
    Role,
    ShopConnection,
    ShopListing,
    ShopPublication,
    User,
)
from app.schemas.misc import ListingOut, ListingUpdate, ShopConnectionIn, ShopConnectionOut
from app.services import audit_service, quality_service, stock_service
from app.utils.security import encrypt_credentials

router = APIRouter(prefix="/shop", tags=["shop"])

_PUBLISHER = (Role.SHOP_MANAGER.value, Role.WAREHOUSE_MANAGER.value, Role.ADMIN.value)


@router.get("/connector-types")
def connector_types(user: User = Depends(get_current_user)):
    return {"types": available_connector_types()}


@router.get("/connections", response_model=list[ShopConnectionOut])
def list_connections(db: Session = Depends(get_db),
                     user: User = Depends(require_role(*_PUBLISHER))):
    connections = db.scalars(select(ShopConnection).order_by(ShopConnection.name)).all()
    return [ShopConnectionOut(
        id=c.id, name=c.name, connector_type=c.connector_type, base_url=c.base_url,
        is_active=c.is_active, has_credentials=bool(c.credentials_encrypted),
    ) for c in connections]


@router.post("/connections", response_model=ShopConnectionOut, status_code=201)
def create_connection(body: ShopConnectionIn, db: Session = Depends(get_db),
                      user: User = Depends(require_role(Role.ADMIN.value))):
    if body.connector_type not in available_connector_types():
        raise HTTPException(422, f"Unbekannter Connector-Typ: {body.connector_type}")
    connection = ShopConnection(
        name=body.name, connector_type=body.connector_type, base_url=body.base_url,
        webhook_secret=body.webhook_secret, is_active=body.is_active,
    )
    if body.credentials:
        connection.credentials_encrypted = encrypt_credentials(json.dumps(body.credentials))
    db.add(connection)
    db.flush()
    audit_service.log(db, user=user, entity_type="shop_connection", entity_id=connection.id,
                      action="create", new_value=connection.name)
    db.commit()
    return ShopConnectionOut(id=connection.id, name=connection.name,
                             connector_type=connection.connector_type,
                             base_url=connection.base_url, is_active=connection.is_active,
                             has_credentials=bool(connection.credentials_encrypted))


@router.post("/connections/{connection_id}/test")
def test_connection(connection_id: str, db: Session = Depends(get_db),
                    user: User = Depends(require_role(Role.ADMIN.value))):
    connection = db.get(ShopConnection, connection_id)
    if connection is None:
        raise HTTPException(404, "Verbindung nicht gefunden")
    try:
        build_connector(connection).test_connection()
    except Exception as exc:
        raise HTTPException(502, f"Verbindungstest fehlgeschlagen: {exc}")
    return {"detail": "Verbindung erfolgreich"}


# ── Listings ────────────────────────────────────────────────────────────────

def _get_listing(db: Session, product_id: str) -> ShopListing:
    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product_id))
    if listing is None:
        raise HTTPException(404, "Noch kein Shoptext vorhanden")
    return listing


@router.get("/products/{product_id}/listing", response_model=ListingOut)
def get_listing(product_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return _get_listing(db, product_id)


@router.patch("/products/{product_id}/listing", response_model=ListingOut)
def update_listing(product_id: str, body: ListingUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_role(*_PUBLISHER))):
    listing = _get_listing(db, product_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        old = getattr(listing, field)
        if old != value:
            setattr(listing, field, value)
            audit_service.log(db, user=user, entity_type="shop_listing", entity_id=listing.id,
                              action="update", field=field, old_value=old, new_value=value)
    db.commit()
    return listing


@router.post("/products/{product_id}/listing/regenerate", status_code=202)
def regenerate_listing(product_id: str, db: Session = Depends(get_db),
                       user: User = Depends(require_role(*_PUBLISHER))):
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Artikel nicht gefunden")
    from app.services import ki_verbrauch
    grund = ki_verbrauch.budget_pruefen(db, product_id, "shoptext")
    if grund:
        raise HTTPException(409, grund)
    queue.enqueue(db, job_type=JobType.GENERATE_SHOPTEXT.value,
                  payload={"product_id": product_id}, product_id=product_id)
    db.commit()
    return {"detail": "Shoptext-Erstellung gestartet"}


# ── Veröffentlichung ────────────────────────────────────────────────────────

@router.post("/products/{product_id}/publish", status_code=202)
def publish(product_id: str, connection_id: str, db: Session = Depends(get_db),
            user: User = Depends(require_role(*_PUBLISHER))):
    """„JETZT VERÖFFENTLICHEN“: Qualitätsprüfung → Publikationsprotokoll → Job."""
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Artikel nicht gefunden")
    connection = db.get(ShopConnection, connection_id)
    if connection is None or not connection.is_active:
        raise HTTPException(404, "Shop-Verbindung nicht gefunden oder inaktiv")

    connector = build_connector(connection)
    missing = quality_service.check_shop_ready(db, product, connector.required_fields())
    if missing:
        raise HTTPException(422, {
            "code": "not_shop_ready",
            "detail": "Produkt noch nicht shopbereit",
            "missing": missing,
        })

    existing = db.scalar(select(ShopPublication).where(
        ShopPublication.product_id == product.id,
        ShopPublication.connection_id == connection.id,
        ShopPublication.status.in_(["pending", "published"])))
    publication = existing or ShopPublication(
        product_id=product.id, connection_id=connection.id, published_by=user.id)
    if existing is None:
        db.add(publication)
        db.flush()
    product.publication_status = "publishing"
    queue.enqueue(db, job_type=JobType.PUBLISH_PRODUCT.value,
                  payload={"publication_id": publication.id}, product_id=product.id)
    audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                      action="publish", new_value=connection.name)
    db.commit()
    return {"detail": "Veröffentlichung gestartet", "publication_id": publication.id}


# ── Bestell-Webhook (Bestandsabbuchung) ─────────────────────────────────────

def _signatur_pruefen(connection: ShopConnection, body: bytes, request: Request) -> None:
    if connection.webhook_secret:
        signature = request.headers.get("X-Webhook-Signature", "")
        expected = hmac.new(connection.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(401, "Ungültige Signatur")


@router.post("/webhooks/{connection_id}/order")
async def order_webhook(connection_id: str, request: Request,
                        db: Session = Depends(get_db)):
    """Verkauf im Shop → Movement 'sale'. HMAC-signiert (webhook_secret)."""
    connection = db.get(ShopConnection, connection_id)
    if connection is None or not connection.is_active:
        raise HTTPException(404, "Unbekannte Verbindung")
    body = await request.body()
    _signatur_pruefen(connection, body, request)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Ungültiges JSON")

    order_ref = str(payload.get("order_id", ""))
    results = []
    for item in payload.get("items", []):
        sku = item.get("sku")
        quantity = int(item.get("quantity", 0))
        if not sku or quantity <= 0:
            continue
        product = db.scalar(select(Product).where(Product.internal_sku == sku))
        if product is None:
            results.append({"sku": sku, "status": "unknown_sku"})
            continue
        try:
            stock_service.apply_movement(
                db, product=product, movement_type=MovementType.SALE.value,
                quantity_change=-quantity, user=None,
                reason="Verkauf im Shop", reference=order_ref or None,
            )
            results.append({"sku": sku, "status": "ok",
                            "new_stock": product.stock_quantity})
        except stock_service.StockError as exc:
            results.append({"sku": sku, "status": "error", "detail": str(exc)})
    db.commit()
    return {"order_id": order_ref, "results": results}


# ── Produkt-Webhook (Änderungen im Shop-Admin) ──────────────────────────────

@router.post("/webhooks/{connection_id}/product")
async def product_webhook(connection_id: str, request: Request,
                          db: Session = Depends(get_db)):
    """Änderung im Shop-Admin → Lager. HMAC-signiert wie der Bestell-Webhook.

    Das Lager bleibt die Quelle der Artikeldaten; was im Shop geändert wird,
    muss deshalb hier ankommen – sonst überschreibt die nächste
    Veröffentlichung die Änderung wieder. Artikel, die es im Lager nicht gibt
    (z. B. Musterartikel des Shops), werden mit „unknown_sku“ quittiert.
    """
    from app.services import shop_abgleich
    connection = db.get(ShopConnection, connection_id)
    if connection is None or not connection.is_active:
        raise HTTPException(404, "Unbekannte Verbindung")
    body = await request.body()
    _signatur_pruefen(connection, body, request)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Ungültiges JSON")
    sku = str(payload.get("sku") or "")
    aktion = str(payload.get("action") or "")
    if not sku or aktion not in shop_abgleich.AKTIONEN:
        raise HTTPException(422, "sku und action (update|activate|deactivate|delete) nötig")
    product = db.scalar(select(Product).where(Product.internal_sku == sku))
    if product is None:
        return {"sku": sku, "status": "unknown_sku"}
    try:
        uebernommen = shop_abgleich.anwenden(
            db, product=product, connection=connection, aktion=aktion,
            aenderungen=payload.get("changes") or {})
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    db.commit()
    return {"sku": sku, "status": "ok", "uebernommen": uebernommen}
