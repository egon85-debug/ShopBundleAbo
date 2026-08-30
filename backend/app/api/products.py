from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.api.serializers import product_out
from app.db import get_db
from app.jobs import queue
from app.models import (
    JobType,
    PriceResearchRun,
    Product,
    Role,
    StockMovement,
    User,
)
from app.schemas.common import Page
from app.schemas.misc import StockMovementIn, StockMovementOut
from app.schemas.product import PriceHistoryEntry, ProductOut, ProductUpdate, QualityCheckOut
from app.services import product_service, quality_service, stock_service, supplier_service

router = APIRouter(prefix="/products", tags=["products"])


def _get_product(db: Session, product_id: str) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Artikel nicht gefunden")
    return product


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
    queue.enqueue(db, job_type=JobType.RESEARCH_PRICES.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()
    return {"detail": "Preisrecherche gestartet"}
