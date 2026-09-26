"""Erfassungs-Workflow: Capture eröffnen → Fotos → Sprache → Antworten → Bestätigen.
Alle Endpoints sind offline-replay-sicher (client_capture_id / idempotente Uploads)."""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, upload_rate_limit
from app.api.serializers import product_out
from app.config import get_settings
from app.db import get_db
from app.jobs import queue
from app.models import (
    ImageKind,
    ImageRole,
    JobType,
    MovementType,
    Product,
    ProductImage,
    ProcessingStatus,
    User,
    VoiceRecording,
)
from app.models.base import utcnow
from app.providers.registry import get_storage
from app.schemas.capture import (
    CaptureAnswers,
    CaptureCreate,
    ConfirmResult,
    DuplicateMatch,
    VoicePayload,
)
from app.schemas.product import ProductOut
from app.services import dedup_service, product_service, stock_service
from app.services.merge_service import low_confidence_fields
from app.utils.ean import is_valid_gtin, normalize_gtin
from app.utils.money import parse_money

router = APIRouter(prefix="/captures", tags=["captures"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_AUDIO_TYPES = {"audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
                       "audio/ogg", "audio/webm", "audio/aac", "audio/m4a"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_AUDIO_BYTES = 50 * 1024 * 1024


def _get_capture(db: Session, capture_id: str, user: User) -> Product:
    product = db.get(Product, capture_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Erfassung nicht gefunden")
    return product


@router.post("", response_model=ProductOut, status_code=201)
def create_capture(body: CaptureCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    product = product_service.create_draft(db, client_capture_id=body.client_capture_id, user=user)
    db.commit()
    db.refresh(product)
    return product_out(product)


@router.get("/{capture_id}", response_model=ProductOut)
def get_capture(capture_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return product_out(_get_capture(db, capture_id, user))


@router.post("/{capture_id}/images", response_model=ProductOut,
             dependencies=[Depends(upload_rate_limit)])
def upload_image(
    capture_id: str,
    file: UploadFile = File(...),
    role: str = Form(ImageRole.OTHER.value),
    client_image_id: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    product = _get_capture(db, capture_id, user)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, f"Bildtyp {file.content_type} nicht erlaubt")
    if role not in [r.value for r in ImageRole]:
        raise HTTPException(422, f"Unbekannte Bildrolle: {role}")
    data = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Bild zu groß (max. 25 MB)")

    # Idempotenz: gleiche client_image_id → kein Duplikat.
    if client_image_id:
        existing = db.scalar(select(ProductImage).where(
            ProductImage.product_id == product.id,
            ProductImage.storage_key.like(f"%{client_image_id}%")))
        if existing:
            return product_out(product)

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    key = f"products/{product.id}/original/{client_image_id or uuid.uuid4().hex}.{ext}"
    # Erst Storage, dann DB + Job in einer Transaktion (kein Bild ohne Datensatz).
    get_storage().put(key, data, file.content_type)
    is_first = not any(i.kind == ImageKind.ORIGINAL.value for i in product.images)
    image = ProductImage(
        product_id=product.id, kind=ImageKind.ORIGINAL.value, role=role,
        storage_key=key, content_type=file.content_type,
        sort_order=len(product.images),
    )
    db.add(image)
    db.flush()
    if is_first:
        product.processing_status = ProcessingStatus.PHOTO_UPLOADED.value
    # Das erste Foto startet die Erkennung (Anforderung 3/4) — mit kurzer
    # Verzoegerung, damit die uebrigen Fotos der Aufnahme mit hineinkommen.
    # Kommt ein Foto erst nach der Erkennung, wird mit allen Fotos neu erkannt.
    if (is_first or role != ImageRole.DAMAGE.value) and not queue.wartet(
            db, product_id=product.id, job_type=JobType.RECOGNIZE_PRODUCT.value):
        queue.enqueue(db, job_type=JobType.RECOGNIZE_PRODUCT.value,
                      payload={"product_id": product.id, "image_id": image.id},
                      product_id=product.id,
                      delay_seconds=get_settings().recognition_delay_seconds)
    db.commit()
    db.refresh(product)
    return product_out(product)


@router.post("/{capture_id}/voice", response_model=ProductOut,
             dependencies=[Depends(upload_rate_limit)])
def upload_voice(
    capture_id: str,
    file: UploadFile | None = File(None),
    transcript: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Audio-Upload ODER On-Device-Transkript (SpeechRecognizer)."""
    product = _get_capture(db, capture_id, user)
    if file is None and not transcript:
        raise HTTPException(422, "Audio-Datei oder Transkript erforderlich")

    recording = VoiceRecording(product_id=product.id)
    content_type = None
    if file is not None:
        if file.content_type not in ALLOWED_AUDIO_TYPES:
            raise HTTPException(415, f"Audiotyp {file.content_type} nicht erlaubt")
        data = file.file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio zu groß (max. 50 MB)")
        key = f"products/{product.id}/voice/{uuid.uuid4().hex}"
        get_storage().put(key, data, file.content_type)
        recording.storage_key = key
        content_type = file.content_type
    if transcript:
        recording.transcript = transcript.strip()
        recording.status = "transcribed"
    db.add(recording)
    db.flush()
    if recording.transcript:
        queue.enqueue(db, job_type=JobType.EXTRACT_VOICE_DATA.value,
                      payload={"recording_id": recording.id}, product_id=product.id)
    else:
        queue.enqueue(db, job_type=JobType.TRANSCRIBE_VOICE.value,
                      payload={"recording_id": recording.id, "content_type": content_type},
                      product_id=product.id)
    db.commit()
    db.refresh(product)
    return product_out(product)


@router.post("/{capture_id}/answers", response_model=ProductOut)
def answer_questions(capture_id: str, body: CaptureAnswers,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Antworten auf Rückfragen, Kandidatenauswahl und direkte Feldkorrekturen.
    Alles wird als Quelle 'user' gemerged (Vorrang vor KI)."""
    from app.services import merge_service
    from app.schemas.ai import ResearchCandidate

    product = _get_capture(db, capture_id, user)
    open_questions = {q["id"]: q for q in (product.open_questions or [])}
    remaining = dict(open_questions)

    for answer in body.answers:
        question = open_questions.get(answer.question_id) if answer.question_id else None
        if answer.selected_candidate_index is not None:
            candidates = product.research_candidates or []
            idx = answer.selected_candidate_index
            if not (0 <= idx < len(candidates)):
                raise HTTPException(422, "Ungültiger Kandidaten-Index")
            candidate = ResearchCandidate.model_validate(candidates[idx])
            candidate.match_score = 1.0  # vom Benutzer bestätigt
            merge_service.merge_research(product, candidate)
            sources = dict(product.field_sources or {})
            for field in ("product_name", "manufacturer", "brand", "ean", "mpn", "category"):
                if getattr(product, field, None):
                    sources[field] = "user"
            product.field_sources = sources
            product.research_candidates = []
        elif answer.field:
            value = answer.value
            if answer.field == "stock_quantity":
                try:
                    stock = int(value)
                except (TypeError, ValueError):
                    raise HTTPException(422, "Bestand muss eine Zahl sein")
                if stock < 0:
                    raise HTTPException(422, "Bestand darf nicht negativ sein")
                product.stock_quantity = stock
                sources = dict(product.field_sources or {})
                sources["stock_quantity"] = "user"
                product.field_sources = sources
            elif answer.field == "purchase_price_net" and question and question.get("kind") == "choice":
                # Antwort auf netto/brutto-Frage
                price = product.purchase_price_net
                if str(value).lower() == "brutto" and price is not None:
                    product.purchase_price_gross = price
                    product.purchase_price_net = None
                conf = dict(product.field_confidence or {})
                conf["purchase_price_net"] = 1.0
                conf["purchase_price_gross"] = 1.0
                product.field_confidence = conf
            elif answer.field == "storage_location_spoken":
                # Sprachabfrage: Lagerplatz einzeln gesprochen. Nicht zuordenbar →
                # Rückfrage statt Raten; die App liest storage_location_code.
                from app.services import location_service, questions_service
                spoken = str(value or "").strip()
                location = location_service.resolve_answer(db, spoken) if spoken else None
                if location:
                    product_service.apply_user_update(
                        db, product=product, changes={"storage_location_id": location.id}, user=user)
                elif spoken:
                    frage = questions_service.lagerplatz_frage(spoken)
                    remaining[frage["id"]] = frage
            elif answer.field == "ean":
                ean = normalize_gtin(str(value)) if value else None
                if ean and not is_valid_gtin(ean):
                    raise HTTPException(422, f"EAN {ean} hat eine ungültige Prüfziffer")
                product_service.apply_user_update(db, product=product,
                                                  changes={"ean": ean}, user=user)
            elif answer.field in product_service.EDITABLE_FIELDS:
                value = parse_money(value) if answer.field.endswith("price_net") or \
                    answer.field.endswith("price_gross") or answer.field.endswith("_price") else value
                product_service.apply_user_update(db, product=product,
                                                  changes={answer.field: value}, user=user)
        if answer.question_id:
            remaining.pop(answer.question_id, None)

    product.open_questions = list(remaining.values())
    db.commit()
    db.refresh(product)
    return product_out(product)


@router.post("/{capture_id}/confirm", response_model=ConfirmResult)
def confirm_capture(
    capture_id: str,
    duplicate_action: str | None = None,  # increase_stock | create_anyway
    duplicate_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Kontrollbildschirm bestätigt. Führt Dublettenprüfung durch (Anforderung 13)."""
    product = _get_capture(db, capture_id, user)

    if product.confirmed_at is not None:
        return ConfirmResult(status="saved", product=product_out(product))

    if duplicate_action == "increase_stock":
        if not duplicate_id:
            raise HTTPException(422, "duplicate_id erforderlich")
        existing = db.get(Product, duplicate_id)
        if existing is None:
            raise HTTPException(404, "Bestehender Artikel nicht gefunden")
        quantity = product.stock_quantity or 0
        if quantity <= 0:
            raise HTTPException(422, "Kein Bestand zum Erhöhen erfasst")
        stock_service.apply_movement(
            db, product=existing, movement_type=MovementType.INBOUND.value,
            quantity_change=quantity, user=user,
            reason=f"Wareneingang aus Erfassung {product.internal_sku}",
        )
        # Fotos der neuen Erfassung dem bestehenden Artikel zuordnen, Entwurf entfernen.
        for image in list(product.images):
            product.images.remove(image)
            existing.images.append(image)
        db.delete(product)
        db.commit()
        db.refresh(existing)
        return ConfirmResult(status="stock_increased", product=product_out(existing))

    if duplicate_action != "create_anyway":
        duplicates = dedup_service.find_duplicates(db, product)
        if duplicates:
            matches = []
            for dup, reason in duplicates:
                primary = next((i for i in dup.images if i.is_primary), None) or \
                    next(iter(dup.images), None)
                from app.api.serializers import image_url
                matches.append(DuplicateMatch(
                    product_id=dup.id, internal_sku=dup.internal_sku,
                    product_name=dup.product_name, ean=dup.ean,
                    stock_quantity=dup.stock_quantity,
                    storage_location_code=dup.storage_location.code if dup.storage_location else None,
                    match_reason=reason,
                    primary_image_url=image_url(primary) if primary else None,
                ))
            return ConfirmResult(status="duplicate_found", duplicates=matches)

    # Endgültig speichern: Anfangsbestand als nachvollziehbarer Wareneingang.
    initial_stock = product.stock_quantity or 0
    product.stock_quantity = 0
    product.confirmed_at = utcnow()
    if initial_stock > 0:
        stock_service.apply_movement(
            db, product=product, movement_type=MovementType.INBOUND.value,
            quantity_change=initial_stock, user=user, reason="Ersterfassung",
        )
    # Bestätigung: alle Felder gelten nun als vom Benutzer geprüft.
    conf = dict(product.field_confidence or {})
    for field in conf:
        conf[field] = 1.0
    product.field_confidence = conf
    if product.processing_status in (ProcessingStatus.REVIEW_REQUIRED.value,):
        missing = []
        from app.services import quality_service
        missing = quality_service.check_shop_ready(db, product)
        product.processing_status = (
            ProcessingStatus.SHOP_READY.value if not missing
            else ProcessingStatus.REVIEW_REQUIRED.value
        )
        if not missing:
            product.publication_status = "ready"
    db.commit()
    db.refresh(product)
    return ConfirmResult(status="saved", product=product_out(product))
