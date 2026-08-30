"""Stammdaten: Lieferanten und Lagerplätze."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db import get_db
from app.models import Role, StorageLocation, Supplier, User
from app.schemas.misc import LocationIn, LocationOut, SupplierIn, SupplierOut
from app.services import audit_service, location_service, supplier_service

router = APIRouter(tags=["masterdata"])

_MANAGER = (Role.WAREHOUSE_MANAGER.value, Role.ADMIN.value)


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(Supplier).order_by(Supplier.name)).all()


@router.get("/suppliers/match", response_model=SupplierOut | None)
def match_supplier(name: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    return supplier_service.find_match(db, name)


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(body: SupplierIn, db: Session = Depends(get_db),
                    user: User = Depends(require_role(*_MANAGER))):
    existing = db.scalar(select(Supplier).where(Supplier.name.ilike(body.name)))
    if existing:
        raise HTTPException(409, "Lieferant existiert bereits")
    supplier = Supplier(**body.model_dump())
    db.add(supplier)
    db.flush()
    audit_service.log(db, user=user, entity_type="supplier", entity_id=supplier.id,
                      action="create", new_value=supplier.name)
    db.commit()
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: str, body: SupplierIn, db: Session = Depends(get_db),
                    user: User = Depends(require_role(*_MANAGER))):
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(404, "Lieferant nicht gefunden")
    for field, value in body.model_dump(exclude_unset=True).items():
        old = getattr(supplier, field)
        if old != value:
            setattr(supplier, field, value)
            audit_service.log(db, user=user, entity_type="supplier", entity_id=supplier.id,
                              action="update", field=field, old_value=old, new_value=value)
    db.commit()
    return supplier


@router.get("/storage-locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(StorageLocation).order_by(StorageLocation.code)).all()


@router.get("/storage-locations/resolve", response_model=LocationOut | None)
def resolve_location(spoken: str, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    return location_service.resolve_spoken(db, spoken)


@router.post("/storage-locations", response_model=LocationOut, status_code=201)
def create_location(body: LocationIn, db: Session = Depends(get_db),
                    user: User = Depends(require_role(*_MANAGER))):
    try:
        location = location_service.create_location(
            db, parent_id=body.parent_id, kind=body.kind, name=body.name)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    audit_service.log(db, user=user, entity_type="storage_location", entity_id=location.id,
                      action="create", new_value=location.code)
    db.commit()
    return location
