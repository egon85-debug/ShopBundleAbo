from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.api.serializers import product_out
from app.db import get_db
from app.jobs import queue
from app.models import (
    ImageKind,
    JobType,
    PriceResearchRun,
    Product,
    ProductImage,
    Role,
    StockMovement,
    User,
)
from app.providers.registry import get_storage
from app.schemas.common import Page
from app.schemas.misc import ImageUpdate, StockMovementIn, StockMovementOut
from app.schemas.product import PriceHistoryEntry, ProductOut, ProductUpdate, QualityCheckOut
from app.services import (
    audit_service,
    product_service,
    quality_service,
    stock_service,
    supplier_service,
)

router = APIRouter(prefix="/products", tags=["products"])

# Wer Bilder freigeben darf: dieselben Rollen, die veröffentlichen dürfen.
_BILDFREIGABE = (Role.SHOP_MANAGER.value, Role.WAREHOUSE_MANAGER.value, Role.ADMIN.value)


def _get_product(db: Session, product_id: str) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Artikel nicht gefunden")
    return product


def _get_image(db: Session, product: Product, image_id: str) -> ProductImage:
    image = db.get(ProductImage, image_id)
    if image is None or image.product_id != product.id:
        raise HTTPException(404, "Bild nicht gefunden")
    return image


@router.get("", response_model=Page[ProductOut])
def list_products(
    q: str | None = None,
    status: str | None = None,
    publication_status: str | None = None,
    category: str | None = None,
    storage_location_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    limit = min(max(limit, 1), 200)
    stmt = select(Product)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Product.product_name.ilike(like), Product.internal_sku.ilike(like),
            Product.ean.ilike(like), Product.manufacturer.ilike(like),
            Product.model.ilike(like),
        ))
    if status:
        stmt = stmt.where(Product.processing_status == status)
    if publication_status:
        stmt = stmt.where(Product.publication_status == publication_status)
    if category:
        stmt = stmt.where(Product.category == category)
    if storage_location_id:
        stmt = stmt.where(Product.storage_location_id == storage_location_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Product.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[product_out(p) for p in items], total=total, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return product_out(_get_product(db, product_id))


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: str, body: ProductUpdate,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _get_product(db, product_id)
    # Mitarbeiter dürfen nur eigene, noch nicht freigegebene Erfassungen bearbeiten.
    if user.role == Role.EMPLOYEE.value and product.created_by != user.id:
        raise HTTPException(403, "Nur eigene Erfassungen bearbeitbar")
    changes = body.model_dump(exclude_unset=True)
    supplier_name = changes.pop("supplier_name", None)
    if supplier_name:
        changes["supplier_id"] = supplier_service.match_or_create(db, supplier_name).id
    product_service.apply_user_update(db, product=product, changes=changes, user=user)
    # Eine Rückfrage zu einem Feld ist beantwortet, sobald jemand das Feld selbst
    # ausfüllt (z. B. den Namen in der App-Detailansicht).
    filled = {field for field, value in changes.items() if value not in (None, "")}
    if product.open_questions and filled:
        product.open_questions = [q for q in product.open_questions
                                  if q.get("field") not in filled]
    db.commit()
    db.refresh(product)
    return product_out(product)


@router.get("/{product_id}/quality", response_model=QualityCheckOut)
def quality(product_id: str, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    product = _get_product(db, product_id)
    missing = quality_service.check_shop_ready(db, product)
    return QualityCheckOut(is_shop_ready=not missing, missing=missing)


@router.post("/{product_id}/stock-movements", response_model=StockMovementOut,
             status_code=201)
def create_movement(product_id: str, body: StockMovementIn,
                    db: Session = Depends(get_db),
                    user: User = Depends(require_role(Role.WAREHOUSE_MANAGER.value,
                                                      Role.ADMIN.value))):
    product = _get_product(db, product_id)
    try:
        movement = stock_service.apply_movement(
            db, product=product, movement_type=body.movement_type,
            quantity_change=body.quantity_change, user=user,
            reason=body.reason, reference=body.reference,
        )
    except stock_service.StockError as exc:
        raise HTTPException(422, str(exc))
    # Shopbestand nachziehen, falls veröffentlicht.
    from app.models import ShopPublication
    publication = db.scalar(select(ShopPublication).where(
        ShopPublication.product_id == product.id,
        ShopPublication.status == "published"))
    if publication:
        queue.enqueue(db, job_type=JobType.SYNC_STOCK.value,
                      payload={"publication_id": publication.id}, product_id=product.id)
    db.commit()
    return movement


@router.get("/{product_id}/stock-movements", response_model=list[StockMovementOut])
def list_movements(product_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _get_product(db, product_id)
    return db.scalars(select(StockMovement)
                      .where(StockMovement.product_id == product_id)
                      .order_by(StockMovement.created_at.desc()).limit(500)).all()


@router.get("/{product_id}/price-history", response_model=list[PriceHistoryEntry])
def price_history(product_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    _get_product(db, product_id)
    return db.scalars(select(PriceResearchRun)
                      .where(PriceResearchRun.product_id == product_id)
                      .order_by(PriceResearchRun.researched_at.desc()).limit(100)).all()


@router.post("/{product_id}/reprice", status_code=202)
def reprice(product_id: str, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    """„Marktpreise aktualisieren“: neuer Recherche-Lauf im Hintergrund."""
    product = _get_product(db, product_id)
    from app.services import ki_verbrauch
    grund = ki_verbrauch.budget_pruefen(db, product.id, "price_research")
    if grund:
        raise HTTPException(409, grund)
    if not queue.wartet(db, product_id=product.id, job_type=JobType.RESEARCH_PRICES.value):
        queue.enqueue(db, job_type=JobType.RESEARCH_PRICES.value,
                      payload={"product_id": product.id, "frisch": True}, product_id=product.id)
    db.commit()
    return {"detail": "Preisrecherche gestartet"}


# ── Bildfreigabe ────────────────────────────────────────────────────────────
# Der Mitarbeiter sieht vor der Veröffentlichung Original und optimierte
# Fassung nebeneinander, wählt das Hauptbild und lehnt misslungene
# Optimierungen ab. Originale sind davon ausgenommen: sie werden nie
# verändert und nie gelöscht.


@router.patch("/{product_id}/images/{image_id}", response_model=ProductOut)
def update_image(product_id: str, image_id: str, body: ImageUpdate,
                 db: Session = Depends(get_db),
                 user: User = Depends(require_role(*_BILDFREIGABE))):
    product = _get_product(db, product_id)
    image = _get_image(db, product, image_id)

    if body.is_primary is True:
        # Veröffentlicht werden nur optimierte Bilder — also kann auch nur
        # eines davon das Hauptbild sein.
        if image.kind != ImageKind.OPTIMIZED.value:
            raise HTTPException(422, "Nur ein optimiertes Bild kann Hauptbild sein")
        for other in product.images:
            if other.is_primary and other.id != image.id:
                other.is_primary = False
        image.is_primary = True
        audit_service.log(db, user=user, entity_type="product_image", entity_id=image.id,
                          action="set_primary", new_value=image.role)
    elif body.is_primary is False and image.is_primary:
        image.is_primary = False
        audit_service.log(db, user=user, entity_type="product_image", entity_id=image.id,
                          action="unset_primary", old_value=image.role)

    if body.sort_order is not None and body.sort_order != image.sort_order:
        audit_service.log(db, user=user, entity_type="product_image", entity_id=image.id,
                          action="reorder", field="sort_order",
                          old_value=image.sort_order, new_value=body.sort_order)
        image.sort_order = body.sort_order

    db.commit()
    db.refresh(product)
    return product_out(product)


@router.delete("/{product_id}/images/{image_id}", response_model=ProductOut)
def reject_image(product_id: str, image_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_role(*_BILDFREIGABE))):
    """Optimiertes Bild ablehnen: es wird entfernt und kommt nicht in den Shop.

    Das Original bleibt bestehen — es ist die Quelle, aus der jederzeit neu
    optimiert werden kann, und es darf nach den Regeln dieses Systems nie
    verloren gehen.
    """
    product = _get_product(db, product_id)
    image = _get_image(db, product, image_id)
    if image.kind != ImageKind.OPTIMIZED.value:
        raise HTTPException(409, "Originalbilder werden nie gelöscht – nur optimierte Fassungen "
                                 "lassen sich ablehnen")

    war_hauptbild = image.is_primary
    try:
        get_storage().delete(image.storage_key)
    except Exception:  # Datei fehlt bereits – der Datensatz geht trotzdem
        pass
    audit_service.log(db, user=user, entity_type="product_image", entity_id=image.id,
                      action="reject", old_value=image.storage_key,
                      reason="Optimierung abgelehnt")
    db.delete(image)
    db.flush()

    if war_hauptbild:
        # Nächstes optimiertes Bild rückt nach, Vorderseite zuerst.
        rest = sorted(
            (i for i in product.images if i.kind == ImageKind.OPTIMIZED.value and i.id != image.id),
            key=lambda i: (i.role != "front", i.sort_order),
        )
        if rest:
            rest[0].is_primary = True

    db.commit()
    db.refresh(product)
    return product_out(product)


@router.post("/{product_id}/ki-budget-freigeben")
def ki_budget_freigeben(product_id: str, db: Session = Depends(get_db),
                        user: User = Depends(require_role(*_BILDFREIGABE))):
    """Für diesen einen Artikel weiteres KI-Budget freigeben und fortsetzen.

    Die Bremse bleibt für alle anderen Artikel bestehen; die Freigabe steht
    im KI-Protokoll und im Audit-Log.
    """
    from app.jobs.handlers import ki_fortsetzen
    from app.services import ki_verbrauch
    product = _get_product(db, product_id)
    betrag = ki_verbrauch.freigeben(db, product.id, von=user.email)
    geplant = ki_fortsetzen(db, product)
    audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                      action="ki_budget_freigabe", new_value=f"+{betrag} $")
    db.commit()
    return {**ki_verbrauch.laeufe_fuer_artikel(db, product.id), "geplant": geplant}


@router.get("/{product_id}/ki-kosten")
def ki_kosten(product_id: str, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    """KI-Läufe des Artikels mit Tokens, Websuchen und Kosten (US-Dollar)."""
    from app.services import ki_verbrauch
    _get_product(db, product_id)
    return ki_verbrauch.laeufe_fuer_artikel(db, product_id)
