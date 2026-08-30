from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ApiModel
from app.utils.money import parse_money


def _money(v):
    if v is None or v == "":
        return None
    parsed = parse_money(v)
    if parsed is None:
        raise ValueError("kein gültiger Geldbetrag")
    return parsed


class ImageOut(ApiModel):
    id: str
    kind: str
    role: str
    storage_key: str
    content_type: str
    width: int | None
    height: int | None
    sort_order: int
    is_primary: bool
    source_image_id: str | None
    url: str | None = None


class ProductBase(BaseModel):
    ean: str | None = None
    gtin: str | None = None
    upc: str | None = None
    mpn: str | None = None
    manufacturer: str | None = None
    brand: str | None = None
    product_name: str | None = None
    model: str | None = None
    short_description: str | None = None
    long_description: str | None = None
    category: str | None = None
    subcategory: str | None = None
    attributes: dict | None = None
    technical_data: dict | None = None
    condition: str | None = None
    packaging_condition: str | None = None
    purchase_price_net: Decimal | None = None
    purchase_price_gross: Decimal | None = None
    sale_price: Decimal | None = None
    minimum_sale_price: Decimal | None = None
    supplier_id: str | None = None
    supplier_name: str | None = None
    purchase_date: date | None = None
    invoice_number: str | None = None
    storage_location_id: str | None = None
    batch_number: str | None = None
    serial_number: str | None = None
    notes: str | None = None

    _money = field_validator(
        "purchase_price_net", "purchase_price_gross", "sale_price", "minimum_sale_price",
        mode="before",
    )(_money)


class ProductUpdate(ProductBase):
    """PATCH: nur gesetzte Felder werden übernommen (auditiert, Quelle 'user')."""


class ProductOut(ApiModel):
    id: str
    internal_sku: str
    ean: str | None
    gtin: str | None
    upc: str | None
    mpn: str | None
    manufacturer: str | None
    brand: str | None
    product_name: str | None
    model: str | None
    short_description: str | None
    long_description: str | None
    category: str | None
    subcategory: str | None
    attributes: dict
    technical_data: dict
    condition: str
    packaging_condition: str | None
    purchase_price_net: Decimal | None
    purchase_price_gross: Decimal | None
    sale_price: Decimal | None
    recommended_sale_price: Decimal | None
    minimum_sale_price: Decimal | None
    lowest_market_price: Decimal | None
    highest_market_price: Decimal | None
    average_market_price: Decimal | None
    median_market_price: Decimal | None
    price_research_date: datetime | None
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int
    supplier_id: str | None
    purchase_date: date | None
    invoice_number: str | None
    storage_location_id: str | None
    batch_number: str | None
    serial_number: str | None
    notes: str | None
    voice_transcript: str | None
    field_confidence: dict
    field_sources: dict
    open_questions: list
    research_candidates: list
    processing_status: str
    publication_status: str
    confirmed_at: datetime | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    supplier_name: str | None = None
    storage_location_code: str | None = None
    images: list[ImageOut] = Field(default_factory=list)


class QualityCheckOut(BaseModel):
    is_shop_ready: bool
    missing: list[str]


class PriceHistoryEntry(ApiModel):
    id: str
    lowest_price: Decimal | None
    highest_price: Decimal | None
    average_price: Decimal | None
    median_price: Decimal | None
    offer_count: int
    comparable_count: int
    researched_at: datetime
