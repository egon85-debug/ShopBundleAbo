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
from app.providers.base import ProviderUnavailable, VisionImage
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


def _aufgeben(job: Job, exc: Exception, schritt: str) -> bool:
    """True, wenn der KI-Schritt ausgelassen und die Kette fortgesetzt wird.

    Dauerhafte Fehler sofort, voruebergehende erst beim letzten Versuch —
    sonst bliebe der Artikel fuer immer in "Erkennung laeuft" o. ae. stehen.
    Der Grund bleibt am Auftrag sichtbar (Adminbereich, Jobs & Fehler).
    """
    if not isinstance(exc, ProviderUnavailable) and job.attempts < job.max_attempts:
        return False
    log.warning("%s fuer Job %s ausgelassen: %s", schritt, job.id, exc)
    job.last_error = f"{schritt} ausgelassen: {type(exc).__name__}: {exc}"[:4000]
    return True


def _refresh_questions(db: Session, product: Product, conflicts: list[str]) -> None:
    from app.services import questions_service
    product.open_questions = questions_service.build_questions(product, conflicts)


# ── Erkennung ────────────────────────────────────────────────────────────────

# Reihenfolge, in der Fotos in die Erkennung gehen: was Name, Modell und EAN
# traegt, zuerst. Schadens- und Zubehoerfotos helfen beim Erkennen nicht.
_ERKENNUNG_REIHENFOLGE = [
    ImageRole.FRONT.value, ImageRole.TYPE_PLATE.value, ImageRole.BARCODE.value,
    ImageRole.BACK.value, ImageRole.PACKAGING.value, ImageRole.SERIAL_NUMBER.value,
]


def _fotos_fuer_erkennung(db: Session, product: Product) -> list[ProductImage]:
    originale = db.scalars(select(ProductImage).where(
        ProductImage.product_id == product.id,
        ProductImage.kind == ImageKind.ORIGINAL.value)).all()
    passend = [i for i in originale if i.role in _ERKENNUNG_REIHENFOLGE] or list(originale)
    return sorted(passend, key=lambda i: (
        _ERKENNUNG_REIHENFOLGE.index(i.role) if i.role in _ERKENNUNG_REIHENFOLGE else 99,
        i.sort_order))


def _merkmale(product: Product) -> tuple:
    return (product.ean, product.mpn, product.product_name, product.model)


def handle_recognize_product(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    fotos = _fotos_fuer_erkennung(db, product)
    if not fotos:
        return
    product.processing_status = ProcessingStatus.RECOGNITION_RUNNING.value
    db.commit()

    started = time.monotonic()
    storage = get_storage()
    bilder = [VisionImage(storage.get(f.storage_key), f.content_type, f.role)
              for f in fotos]
    vorher = _merkmale(product)
    try:
        vision = get_vision()
        analysis = vision.analyze_product_images(bilder)
    except Exception as exc:
        if not _aufgeben(job, exc, "Erkennung"):
            raise
        # Ohne Erkennung ist der Artikel nicht verloren: die Angaben kommen im
        # Kontrollbildschirm von Hand, und die Bilder brauchen keine KI.
        _refresh_questions(db, product, [])
        queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                      payload={"product_id": product.id}, product_id=product.id)
        db.commit()
        return
    conflicts = merge_service.merge_vision(product, analysis)
    _record_ai_run(db, product_id=product.id, kind="vision", provider=vision.name,
                   # Bild-IDs statt Pfaden: sechs Pfade sprengen die 500 Zeichen
                   input_ref=",".join(f.id for f in fotos)[:500],
                   raw=analysis.model_dump(mode="json"),
                   validated=analysis.model_dump(mode="json"),
                   confidence=analysis.confidence, started=started)

    product.processing_status = ProcessingStatus.PRODUCT_IDENTIFIED.value
    _refresh_questions(db, product, conflicts)

    # Recherche nur, wenn es etwas zu suchen gibt — und bei einer erneuten
    # Erkennung (weiteres Foto) nur, wenn sich Name/Modell/EAN geaendert haben.
    # Jede Recherche kostet Websuchen.
    schon_recherchiert = db.scalar(select(AiRun.id).where(
        AiRun.product_id == product.id, AiRun.kind == "product_research").limit(1))
    if (product.ean or product.mpn or product.product_name) and \
            (not schon_recherchiert or _merkmale(product) != vorher):
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
    try:
        research = get_research()
        candidates = research.identify_product(
            ean=product.ean, mpn=product.mpn,
            query=" ".join(filter(None, [product.manufacturer, product.product_name,
                                         product.model])) or None,
        )
    except Exception as exc:
        if not _aufgeben(job, exc, "Produktrecherche"):
            raise
        # Recherche ist eine Ergaenzung — ohne sie bleibt es bei Foto und Eingabe.
        return
    _record_ai_run(db, product_id=product.id, kind="product_research", provider=research.name,
                   input_ref=product.ean or product.mpn,
                   raw={"count": len(candidates)},
                   validated={"items": [c.model_dump(mode="json") for c in candidates]},
                   confidence={}, started=started)

    conflicts: list[str] = []
    eindeutig = _eindeutiger_treffer(candidates)
    if eindeutig is not None:
        conflicts = merge_service.merge_research(product, eindeutig)
        product.research_candidates = []
    elif candidates:
        # Kein klarer Treffer → nie raten, der Benutzer waehlt aus.
        product.research_candidates = [c.model_dump(mode="json") for c in candidates[:5]]
    _refresh_questions(db, product, conflicts)

    queue.enqueue(db, job_type=JobType.RESEARCH_PRICES.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()


# Ab dieser Sicherheit wird ein Recherche-Treffer ohne Rueckfrage uebernommen
# (Quelle "research" — Benutzerangaben bleiben davon unberuehrt).
TREFFER_SICHER = 0.7


def _eindeutiger_treffer(candidates: list[ResearchCandidate]) -> ResearchCandidate | None:
    """Der Treffer, der sicher genug und klar besser als die anderen ist."""
    if not candidates:
        return None
    sortiert = sorted(candidates, key=lambda c: c.match_score, reverse=True)
    bester = sortiert[0]
    if bester.match_score < TREFFER_SICHER:
        return None
    if len(sortiert) > 1 and sortiert[1].match_score > bester.match_score - 0.2:
        return None  # zwei aehnlich gute Treffer (z. B. Varianten) → nachfragen
    return bester


def handle_research_prices(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    product.processing_status = ProcessingStatus.PRICE_RESEARCH_RUNNING.value
    db.commit()

    query = " ".join(filter(None, [product.manufacturer, product.product_name, product.model]))
    if product.ean or query:
        try:
            research = get_research()
            offers = research.find_offers(ean=product.ean, query=query,
                                          condition=product.condition)
            pricing_service.evaluate_offers(db, product=product, offers=offers)
        except Exception as exc:
            if not _aufgeben(job, exc, "Preisrecherche"):
                raise
    # Auch ohne Recherche weiter zur Pruefung — sonst haengt der Artikel.
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
    try:
        stt = get_stt()
        started = time.monotonic()
        transcript = stt.transcribe(audio, job.payload.get("content_type", "audio/mp4"))
    except Exception as exc:
        if not _aufgeben(job, exc, "Transkription"):
            raise
        # Die Aufnahme bleibt erhalten; sobald ein Dienst eingerichtet ist,
        # laesst sich der Auftrag im Adminbereich erneut anstossen.
        recording.status = "stt_unavailable"
        db.commit()
        return
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
    # Das Gesagte zuerst am Artikel sichern: es ist die Benutzerangabe und
    # bleibt auch dann lesbar, wenn die Auswertung nicht moeglich ist.
    transcript_note = recording.transcript.strip()
    if transcript_note not in (product.voice_transcript or ""):
        product.voice_transcript = (
            (product.voice_transcript + "\n" + transcript_note)
            if product.voice_transcript else transcript_note
        )
    try:
        llm = get_llm()
        started = time.monotonic()
        extraction = llm.extract_voice_data(recording.transcript)
    except Exception as exc:
        if not _aufgeben(job, exc, "Sprachauswertung"):
            raise
        recording.status = "transcribed"
        db.commit()
        return
    conflicts = merge_service.merge_voice(db, product, extraction)
    _record_ai_run(db, product_id=product.id, kind="extraction", provider=llm.name,
                   input_ref=recording.id, raw=extraction.model_dump(mode="json"),
                   validated=extraction.model_dump(mode="json"),
                   confidence=extraction.confidence, started=started)
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
    try:
        listing = listing_service.generate(db, product)
        _record_ai_run(db, product_id=product.id, kind="shoptext", provider=get_llm().name,
                       input_ref=None, raw={}, validated={"seo_title": listing.seo_title},
                       confidence={}, started=started)
    except Exception as exc:
        if not _aufgeben(job, exc, "Shoptext"):
            raise
        # Texte lassen sich spaeter schreiben oder neu erzeugen — der Artikel
        # darf deswegen nicht in "Shoptext wird erstellt" haengen bleiben.
    product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value
    _refresh_questions(db, product, [])
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
