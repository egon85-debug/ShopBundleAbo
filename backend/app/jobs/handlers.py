"""Job-Handler: die Schritte der KI-Pipeline (docs/ai-pipeline.md).
Jeder Handler ist idempotent aufgebaut — ein Retry darf keine Duplikate erzeugen."""
import logging
import time
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AiRun,
    ImageKind,
    ImageRole,
    Job,
    JobType,
    Product,
    ProductImage,
    ProcessingStatus,
    ShopPublication,
    VoiceRecording,
)
from app.models.base import utcnow
from app.providers.registry import (
    get_image_optimizer,
    get_llm,
    get_research,
    get_storage,
    get_stt,
    get_vision,
)
from app.schemas.ai import ResearchCandidate
from app.services import listing_service, merge_service, pricing_service, publish_service
from app.jobs import queue

log = logging.getLogger("winterfeld.jobs")


def _record_ai_run(db: Session, *, product_id: str | None, kind: str, provider: str,
                   input_ref: str | None, raw: dict, validated: dict,
                   confidence: dict, started: float) -> None:
    db.add(AiRun(
        product_id=product_id, kind=kind, provider=provider, input_ref=input_ref,
        raw_output=raw, validated_output=validated, confidence=confidence,
        status="ok", duration_ms=int((time.monotonic() - started) * 1000),
    ))


def _refresh_questions(db: Session, product: Product, conflicts: list[str]) -> None:
    from app.services import questions_service
    product.open_questions = questions_service.build_questions(product, conflicts)


# ── Erkennung ────────────────────────────────────────────────────────────────

def handle_recognize_product(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    image = db.get(ProductImage, job.payload["image_id"])
    if product is None or image is None:
        return
    product.processing_status = ProcessingStatus.RECOGNITION_RUNNING.value
    db.commit()

    started = time.monotonic()
    data = get_storage().get(image.storage_key)
    vision = get_vision()
    analysis = vision.analyze_product_image(data, image.content_type)
    conflicts = merge_service.merge_vision(product, analysis)
    _record_ai_run(db, product_id=product.id, kind="vision", provider=vision.name,
                   input_ref=image.storage_key, raw=analysis.model_dump(mode="json"),
                   validated=analysis.model_dump(mode="json"),
                   confidence=analysis.confidence, started=started)

    product.processing_status = ProcessingStatus.PRODUCT_IDENTIFIED.value
    _refresh_questions(db, product, conflicts)

    # Folgejobs: Recherche (wenn Identifikationsmerkmal vorhanden) und Bildoptimierung.
    if product.ean or product.mpn or product.product_name:
        queue.enqueue(db, job_type=JobType.RESEARCH_PRODUCT.value,
                      payload={"product_id": product.id}, product_id=product.id)
    queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()


# ── Produktrecherche ─────────────────────────────────────────────────────────

def handle_research_product(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    started = time.monotonic()
    research = get_research()
    candidates = research.identify_product(
        ean=product.ean, mpn=product.mpn,
        query=" ".join(filter(None, [product.manufacturer, product.product_name, product.model])) or None,
    )
    _record_ai_run(db, product_id=product.id, kind="product_research", provider=research.name,
                   input_ref=product.ean or product.mpn,
                   raw={"count": len(candidates)},
                   validated={"items": [c.model_dump(mode="json") for c in candidates]},
                   confidence={}, started=started)

    conflicts: list[str] = []
    if len(candidates) == 1:
        conflicts = merge_service.merge_research(product, candidates[0])
        product.research_candidates = []
    elif len(candidates) > 1:
        # Nie automatisch irgendeinen Treffer wählen → Benutzer entscheidet.
        product.research_candidates = [c.model_dump(mode="json") for c in candidates[:5]]
    _refresh_questions(db, product, conflicts)

    queue.enqueue(db, job_type=JobType.RESEARCH_PRICES.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()


def handle_research_prices(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    product.processing_status = ProcessingStatus.PRICE_RESEARCH_RUNNING.value
    db.commit()

    query = " ".join(filter(None, [product.manufacturer, product.product_name, product.model]))
    if not (product.ean or query):
        return
    research = get_research()
    offers = research.find_offers(ean=product.ean, query=query, condition=product.condition)
    pricing_service.evaluate_offers(db, product=product, offers=offers)
    product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value
    _refresh_questions(db, product, [])
    db.commit()


# ── Sprache ──────────────────────────────────────────────────────────────────

def handle_transcribe_voice(db: Session, job: Job) -> None:
    recording = db.get(VoiceRecording, job.payload["recording_id"])
    if recording is None or recording.transcript:
        # bereits transkribiert (Client-Transkript) → direkt zur Extraktion
        if recording is not None:
            queue.enqueue(db, job_type=JobType.EXTRACT_VOICE_DATA.value,
                          payload={"recording_id": recording.id},
                          product_id=recording.product_id)
            db.commit()
        return
    audio = get_storage().get(recording.storage_key)
    stt = get_stt()
    started = time.monotonic()
    transcript = stt.transcribe(audio, job.payload.get("content_type", "audio/mp4"))
    recording.transcript = transcript
    recording.status = "transcribed"
    _record_ai_run(db, product_id=recording.product_id, kind="stt", provider=stt.name,
                   input_ref=recording.storage_key, raw={"text": transcript},
                   validated={"text": transcript}, confidence={}, started=started)

    # DSGVO: Audio nach Konfiguration löschen (Default sofort).
    retention_hours = get_settings().voice_retention_hours
    recording.retention_until = utcnow() + timedelta(hours=retention_hours)
    queue.enqueue(db, job_type=JobType.CLEANUP_VOICE.value,
                  payload={"recording_id": recording.id},
                  delay_seconds=retention_hours * 3600)
    queue.enqueue(db, job_type=JobType.EXTRACT_VOICE_DATA.value,
                  payload={"recording_id": recording.id}, product_id=recording.product_id)
    db.commit()


def handle_extract_voice_data(db: Session, job: Job) -> None:
    recording = db.get(VoiceRecording, job.payload["recording_id"])
    if recording is None or not recording.transcript:
        return
    product = db.get(Product, recording.product_id)
    if product is None:
        return
    llm = get_llm()
    started = time.monotonic()
    extraction = llm.extract_voice_data(recording.transcript)
    conflicts = merge_service.merge_voice(db, product, extraction)
    _record_ai_run(db, product_id=product.id, kind="extraction", provider=llm.name,
                   input_ref=recording.id, raw=extraction.model_dump(mode="json"),
                   validated=extraction.model_dump(mode="json"),
                   confidence=extraction.confidence, started=started)
    transcript_note = recording.transcript.strip()
    product.voice_transcript = (
        (product.voice_transcript + "\n" + transcript_note)
        if product.voice_transcript else transcript_note
    )
    recording.status = "extracted"
    _refresh_questions(db, product, conflicts)
    db.commit()


def handle_cleanup_voice(db: Session, job: Job) -> None:
    recording = db.get(VoiceRecording, job.payload["recording_id"])
    if recording is None or not recording.storage_key or recording.audio_deleted_at:
        return
    get_storage().delete(recording.storage_key)
    recording.audio_deleted_at = utcnow()
    db.commit()


# ── Bilder ───────────────────────────────────────────────────────────────────

def handle_optimize_images(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    product.processing_status = ProcessingStatus.IMAGES_OPTIMIZING.value
    db.commit()

    storage = get_storage()
    optimizer = get_image_optimizer()
    originals = db.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id,
                                   ProductImage.kind == ImageKind.ORIGINAL.value)
    ).all()
    existing_sources = {
        i.source_image_id
        for i in db.scalars(select(ProductImage).where(
            ProductImage.product_id == product.id,
            ProductImage.kind == ImageKind.OPTIMIZED.value)).all()
    }
    has_primary = bool(db.scalar(
        select(ProductImage).where(ProductImage.product_id == product.id,
                                   ProductImage.is_primary.is_(True)).limit(1)))
    for original in originals:
        if original.id in existing_sources:
            continue  # idempotent bei Retry
        if original.role == ImageRole.BARCODE.value:
            continue  # reine Barcode-Fotos gehören nicht in den Shop
        data = storage.get(original.storage_key)
        preserve = original.role == ImageRole.DAMAGE.value
        result = optimizer.optimize(data, preserve_condition=preserve)
        key = original.storage_key.rsplit(".", 1)[0] + ".shop.jpg"
        storage.put(key, result.data, result.content_type)
        optimized = ProductImage(
            product_id=product.id, kind=ImageKind.OPTIMIZED.value, role=original.role,
            storage_key=key, content_type=result.content_type,
            width=result.width, height=result.height,
            sort_order=original.sort_order, source_image_id=original.id,
            is_primary=not has_primary and original.role == ImageRole.FRONT.value,
        )
        if optimized.is_primary:
            has_primary = True
        db.add(optimized)
    queue.enqueue(db, job_type=JobType.GENERATE_SHOPTEXT.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()


# ── Shoptext / Veröffentlichung / Bestandssync ───────────────────────────────

def handle_generate_shoptext(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    product.processing_status = ProcessingStatus.SHOPTEXT_GENERATING.value
    db.commit()
    started = time.monotonic()
    listing = listing_service.generate(db, product)
    _record_ai_run(db, product_id=product.id, kind="shoptext", provider=get_llm().name,
                   input_ref=None, raw={}, validated={"seo_title": listing.seo_title},
                   confidence={}, started=started)
    product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value
    db.commit()


def handle_publish_product(db: Session, job: Job) -> None:
    publication = db.get(ShopPublication, job.payload["publication_id"])
    if publication is None or publication.status == "published":
        return
    try:
        publish_service.execute_publication(db, publication)
        db.commit()
    except Exception as exc:
        publication.error = str(exc)[:2000]
        if job.attempts >= job.max_attempts:
            publication.status = "failed"
            product = db.get(Product, publication.product_id)
            if product is not None:
                # Artikel bleibt „Shopbereit“ (Anforderung 31).
                product.publication_status = "publish_failed"
                product.processing_status = ProcessingStatus.SHOP_READY.value
        db.commit()
        raise


def handle_sync_stock(db: Session, job: Job) -> None:
    from app.connectors.registry import build_connector
    from app.models import ShopConnection
    publication = db.get(ShopPublication, job.payload["publication_id"])
    if publication is None or not publication.external_id:
        return
    product = db.get(Product, publication.product_id)
    connection = db.get(ShopConnection, publication.connection_id)
    if product is None or connection is None or not connection.is_active:
        return
    build_connector(connection).update_stock(publication.external_id, product.available_quantity)
    db.commit()


HANDLERS = {
    JobType.RECOGNIZE_PRODUCT.value: handle_recognize_product,
    JobType.RESEARCH_PRODUCT.value: handle_research_product,
    JobType.RESEARCH_PRICES.value: handle_research_prices,
    JobType.TRANSCRIBE_VOICE.value: handle_transcribe_voice,
    JobType.EXTRACT_VOICE_DATA.value: handle_extract_voice_data,
    JobType.CLEANUP_VOICE.value: handle_cleanup_voice,
    JobType.OPTIMIZE_IMAGES.value: handle_optimize_images,
    JobType.GENERATE_SHOPTEXT.value: handle_generate_shoptext,
    JobType.PUBLISH_PRODUCT.value: handle_publish_product,
    JobType.SYNC_STOCK.value: handle_sync_stock,
}
