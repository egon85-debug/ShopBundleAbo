from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import ApiModel


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    customer_number: str | None = None
    payment_terms: str | None = None
    notes: str | None = None


class SupplierOut(ApiModel):
    id: str
    name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    address: str | None
    customer_number: str | None
    payment_terms: str | None
    notes: str | None
    created_at: datetime


class LocationIn(BaseModel):
    parent_id: str | None = None
    kind: str
    name: str = Field(min_length=1, max_length=120)


class LocationOut(ApiModel):
    id: str
    parent_id: str | None
    kind: str
    name: str
    code: str
    qr_code_value: str | None


class StockMovementIn(BaseModel):
    movement_type: str
    quantity_change: int
    reason: str | None = None
    reference: str | None = None


class StockMovementOut(ApiModel):
    id: str
    product_id: str
    movement_type: str
    quantity_change: int
    quantity_before: int
    quantity_after: int
    reason: str | None
    reference: str | None
    user_id: str | None
    created_at: datetime


class ShopConnectionIn(BaseModel):
    name: str
    connector_type: str
    base_url: str
    credentials: dict | None = None  # z. B. {"consumer_key": …, "consumer_secret": …}
    webhook_secret: str | None = None
    is_active: bool = True


class ShopConnectionOut(ApiModel):
    id: str
    name: str
    connector_type: str
    base_url: str
    is_active: bool
    has_credentials: bool = False


class ListingOut(ApiModel):
    product_id: str
    seo_title: str | None
    short_description: str | None
    long_description: str | None
    bullet_points: list
    scope_of_delivery: str | None
    condition_note: str | None
    meta_title: str | None
    meta_description: str | None
    url_slug: str | None
    tags: list
    suggested_price: Decimal | None
    generated_at: datetime | None


class ImageUpdate(BaseModel):
    """Änderung an einem Produktbild aus der Freigabeansicht."""
    is_primary: bool | None = None
    sort_order: int | None = None


class ListingUpdate(BaseModel):
    seo_title: str | None = None
    short_description: str | None = None
    long_description: str | None = None
    bullet_points: list[str] | None = None
    scope_of_delivery: str | None = None
    condition_note: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    url_slug: str | None = None
    tags: list[str] | None = None


class DashboardOut(BaseModel):
    products_today: int
    products_total: int
    review_required: int
    shop_ready: int
    published: int
    pending_jobs: int
    failed_jobs: int


class JobOut(ApiModel):
    id: str
    job_type: str
    status: str
    attempts: int
    max_attempts: int
    run_at: datetime
    last_error: str | None
    product_id: str | None
    created_at: datetime


class AuditLogOut(ApiModel):
    id: str
    user_id: str | None
    user_name: str | None
    entity_type: str
    entity_id: str | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    reason: str | None
    created_at: datetime
