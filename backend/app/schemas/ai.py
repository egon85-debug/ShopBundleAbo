"""Strikte Schemas für KI-Ausgaben (Anforderung 26).
Alles Unbekannte ist None — KI darf nichts erfinden. Preise sind Strings/Decimal."""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.money import parse_money


class _StrictAiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Confidence(BaseModel):
    model_config = ConfigDict(extra="allow")

    def value_for(self, field: str, default: float = 0.5) -> float:
        v = getattr(self, field, None) or (self.model_extra or {}).get(field)
        try:
            f = float(v)
        except (TypeError, ValueError):
            return default
        return min(max(f, 0.0), 1.0)


def _money_validator(v):
    if v is None:
        return None
    parsed = parse_money(v)
    if parsed is None:
        raise ValueError("kein gültiger Geldbetrag")
    return parsed


class VisionAnalysis(_StrictAiModel):
    """Ausgabe der Bilderkennung (Vision + OCR)."""

    manufacturer: str | None = None
    brand: str | None = None
    product_name: str | None = None
    model: str | None = None
    model_number: str | None = None
    mpn: str | None = None
    ean: str | None = None
    upc: str | None = None
    category: str | None = None
    subcategory: str | None = None
    color: str | None = None
    size: str | None = None
    variant: str | None = None
    technical_data: dict[str, str] = Field(default_factory=dict)
    packaging_info: str | None = None
    visible_condition: str | None = None
    ocr_texts: list[str] = Field(default_factory=list)
    other_features: list[str] = Field(default_factory=list)
    confidence: dict[str, float] = Field(default_factory=dict)

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, v: dict) -> dict[str, float]:
        out = {}
        for k, raw in v.items():
            try:
                out[k] = min(max(float(raw), 0.0), 1.0)
            except (TypeError, ValueError):
                continue
        return out


class VoiceExtraction(_StrictAiModel):
    """Strukturierte Daten aus der Spracheingabe."""

    stock: int | None = Field(default=None, ge=0)
    purchase_price_net: Decimal | None = None
    purchase_price_gross: Decimal | None = None
    sale_price: Decimal | None = None
    minimum_sale_price: Decimal | None = None
    supplier_name: str | None = None
    purchase_date: str | None = None  # ISO-Datum als String, Validierung im Merge
    invoice_number: str | None = None
    storage_location_spoken: str | None = None
    condition: str | None = None
    packaging_condition: str | None = None
    damaged_count: int | None = Field(default=None, ge=0)
    batch_number: str | None = None
    serial_number: str | None = None
    internal_article_number: str | None = None
    notes: str | None = None
    origin: str | None = None
    confidence: dict[str, float] = Field(default_factory=dict)

    _parse_net = field_validator("purchase_price_net", "purchase_price_gross", "sale_price",
                                 "minimum_sale_price", mode="before")(_money_validator)

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, v: dict) -> dict[str, float]:
        out = {}
        for k, raw in v.items():
            try:
                out[k] = min(max(float(raw), 0.0), 1.0)
            except (TypeError, ValueError):
                continue
        return out


class ResearchCandidate(_StrictAiModel):
    """Ein möglicher Produkt-Treffer der Online-Recherche."""

    product_name: str | None = None
    manufacturer: str | None = None
    brand: str | None = None
    ean: str | None = None
    mpn: str | None = None
    category: str | None = None
    description: str | None = None
    technical_data: dict[str, str] = Field(default_factory=dict)
    attributes: dict[str, str] = Field(default_factory=dict)
    image_url: str | None = None
    source_url: str | None = None
    match_score: float = Field(default=0.5, ge=0.0, le=1.0)


class PriceOffer(_StrictAiModel):
    """Ein gefundenes Angebot aus der Preisrecherche."""

    title: str | None = None
    price: Decimal
    shipping_cost: Decimal | None = None
    condition: str = "unknown"  # new|used|refurbished|unknown
    url: str | None = None
    source_name: str | None = None
    # Vom Recherche-Provider beurteilt: gleiches Produkt/Variante/Gebinde?
    is_same_variant: bool = True
    pack_size: int | None = Field(default=None, ge=1)

    _parse_price = field_validator("price", "shipping_cost", mode="before")(_money_validator)


class ShopTextGeneration(_StrictAiModel):
    """Generierte Shoptexte — nur aus verifizierten Feldern."""

    seo_title: str
    short_description: str
    long_description: str
    bullet_points: list[str] = Field(default_factory=list)
    scope_of_delivery: str | None = None
    condition_note: str | None = None
    meta_title: str
    meta_description: str
    url_slug: str
    tags: list[str] = Field(default_factory=list)
    category: str | None = None
