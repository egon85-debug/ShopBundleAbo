from pydantic import BaseModel, Field

from app.schemas.product import ProductOut


class CaptureCreate(BaseModel):
    client_capture_id: str = Field(min_length=8, max_length=64)
    quick_mode: bool = False


class VoicePayload(BaseModel):
    """Entweder On-Device-Transkript oder es wurde Audio hochgeladen (multipart)."""

    transcript: str | None = None


class CaptureAnswer(BaseModel):
    """Antwort auf Rückfragen / Kandidatenauswahl / direkte Feldkorrektur."""

    question_id: str | None = None
    field: str | None = None
    value: str | int | float | None = None
    selected_candidate_index: int | None = None


class CaptureAnswers(BaseModel):
    answers: list[CaptureAnswer] = Field(default_factory=list)


class DuplicateMatch(BaseModel):
    product_id: str
    internal_sku: str
    product_name: str | None
    ean: str | None
    stock_quantity: int
    storage_location_code: str | None
    match_reason: str
    primary_image_url: str | None = None


class ConfirmResult(BaseModel):
    status: str  # saved | duplicate_found | stock_increased
    product: ProductOut | None = None
    duplicates: list[DuplicateMatch] = Field(default_factory=list)
