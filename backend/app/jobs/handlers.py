"""Job-Handler: die Schritte der KI-Pipeline (docs/ai-pipeline.md).
Jeder Handler ist idempotent aufgebaut — ein Retry darf keine Duplikate erzeugen."""
import logging
import time
from datetime import timedelta

from sqlalchemy import func, select
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
from app.providers import produktdatenbanken
from app.providers.base import ProviderUnavailable, VisionImage
from app.providers.registry import (
    get_image_optimizer,
    get_llm,
    get_research,
    get_storage,
    get_stt,
    get_vision,
)
from app.schemas.ai import PriceOffer, ResearchCandidate
from app.services import (
    ki_verbrauch,
    listing_service,
    medien,
    merge_service,
    pricing_service,
    publish_service,
)
from app.jobs import queue

log = logging.getLogger("winterfeld.jobs")


def _record_ai_run(db: Session, *, product_id: str | None, kind: str, provider: str,
                   input_ref: str | None, raw: dict, validated: dict,
                   confidence: dict, started: float,
                   verbrauch: list | None = None, status: str = "ok",
                   error: str | None = None) -> None:
    werte = ki_verbrauch.summe(verbrauch) if verbrauch else {}
    db.add(AiRun(
        product_id=product_id, kind=kind, provider=provider, input_ref=input_ref,
        raw_output=raw, validated_output=validated, confidence=confidence,
        status=status, error=error, duration_ms=int((time.monotonic() - started) * 1000),
        **werte,
    ))


def _kosten_trotz_fehler(db: Session, *, product_id: str | None, kind: str,
                         provider: str, verbrauch: list, exc: Exception,
                         started: float) -> None:
    """Auch ein gescheiterter Aufruf kostet, wenn die API schon geantwortet hat
    (z. B. unlesbare Antwort). Sofort sichern – ein Retry rollt sonst zurück."""
    if not verbrauch:
        return
    _record_ai_run(db, product_id=product_id, kind=kind, provider=provider,
                   input_ref=None, raw={}, validated={}, confidence={},
                   started=started, verbrauch=verbrauch, status="error",
                   error=f"{type(exc).__name__}: {exc}"[:2000])
    db.commit()


# Ergebnisse einer Recherche zur selben EAN werden so lange wiederverwendet –
# gleiche Anfrage, gleiches Ergebnis, keine zweite Websuche. Mehrere Stück
# desselben Artikels hintereinander zu erfassen ist im Lager der Normalfall.
PRODUKTRECHERCHE_GUELTIG = timedelta(days=7)
PREISRECHERCHE_GUELTIG = timedelta(hours=24)


def _letzter_lauf(db: Session, *, kind: str, input_ref: str, gueltig: timedelta) -> AiRun | None:
    return db.scalar(select(AiRun).where(
        AiRun.kind == kind, AiRun.input_ref == input_ref, AiRun.status == "ok",
        AiRun.created_at >= utcnow() - gueltig,
    ).order_by(AiRun.created_at.desc()).limit(1))


def _ueber_budget(db: Session, product: Product, kind: str) -> bool:
    """Harte Bremse: True, wenn das KI-Budget des Artikels den Schritt nicht
    mehr hergibt. Der ausgelassene Schritt steht sichtbar im KI-Protokoll."""
    grund = ki_verbrauch.budget_pruefen(db, product.id, kind)
    if grund is None:
        return False
    log.info("KI-Schritt %s für %s ausgelassen: %s", kind, product.id, grund)
    db.add(AiRun(product_id=product.id, kind=kind, provider="budget",
                 raw_output={}, validated_output={}, confidence={},
                 status="budget", error=grund))
    return True


def _einplanen(db: Session, product: Product, job_type: str, **payload) -> None:
    """Auftrag nur anlegen, wenn nicht schon einer für den Artikel wartet."""
    if not queue.wartet(db, product_id=product.id, job_type=job_type):
        queue.enqueue(db, job_type=job_type, payload={"product_id": product.id, **payload},
                      product_id=product.id)


def _shoptext_einplanen(db: Session, product: Product) -> None:
    _einplanen(db, product, JobType.GENERATE_SHOPTEXT.value)


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


def _erkennung_ueberfluessig(db: Session, product: Product) -> str | None:
    """Grund, warum eine erneute Bilderkennung nichts mehr bringt – sonst None.

    Jedes nachgereichte Foto löste früher eine neue Erkennung mit *allen*
    Fotos aus; bei fünf Fotos lief sie mehrfach und verbrauchte das Budget,
    bevor Recherche und Shoptext an der Reihe waren.
    """
    laeufe = db.scalar(select(func.count()).select_from(AiRun).where(
        AiRun.product_id == product.id, AiRun.kind == "vision", AiRun.status == "ok")) or 0
    if laeufe == 0:
        return None
    if laeufe >= getattr(get_settings(), "ki_max_erkennungen", 2):
        return f"schon {laeufe}× erkannt (Höchstzahl)"
    if product.product_name and (product.ean or product.mpn or product.model):
        return "Artikel ist bereits erkannt"
    return None


def _pruefen_lassen(product: Product) -> None:
    """Endzustand, wenn kein weiterer KI-Schritt folgt: bereit zur Kontrolle."""
    if product.processing_status in (
            ProcessingStatus.RECOGNITION_RUNNING.value, ProcessingStatus.PRODUCT_IDENTIFIED.value,
            ProcessingStatus.IMAGES_OPTIMIZING.value, ProcessingStatus.PHOTO_UPLOADED.value):
        product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value


def handle_recognize_product(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    fotos = _fotos_fuer_erkennung(db, product)
    if not fotos:
        return
    grund = _erkennung_ueberfluessig(db, product)
    if grund:
        # Neue Fotos brauchen nur noch die Bildoptimierung, keine neue Erkennung.
        log.info("Erkennung für %s ausgelassen: %s", product.id, grund)
        _pruefen_lassen(product)
        queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                      payload={"product_id": product.id}, product_id=product.id)
        db.commit()
        return
    product.processing_status = ProcessingStatus.RECOGNITION_RUNNING.value
    db.commit()

    started = time.monotonic()
    storage = get_storage()
    bilder = [VisionImage(storage.get(f.storage_key), f.content_type, f.role)
              for f in fotos]
    vorher = _merkmale(product)
    if _ueber_budget(db, product, "vision"):
        _pruefen_lassen(product)
        _refresh_questions(db, product, [])
        queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                      payload={"product_id": product.id}, product_id=product.id)
        _shoptext_einplanen(db, product)
        db.commit()
        return
    vision_name = "vision"
    with ki_verbrauch.messen() as verbrauch:
        try:
            vision = get_vision()
            vision_name = vision.name
            analysis = vision.analyze_product_images(bilder)
        except Exception as exc:
            _kosten_trotz_fehler(db, product_id=product.id, kind="vision", provider=vision_name,
                                 verbrauch=verbrauch, exc=exc, started=started)
            if not _aufgeben(job, exc, "Erkennung"):
                raise
            # Ohne Erkennung ist der Artikel nicht verloren: die Angaben kommen im
            # Kontrollbildschirm von Hand, und die Bilder brauchen keine KI.
            _refresh_questions(db, product, [])
            queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                          payload={"product_id": product.id}, product_id=product.id)
            _shoptext_einplanen(db, product)
            db.commit()
            return
    conflicts = merge_service.merge_vision(product, analysis)
    _record_ai_run(db, product_id=product.id, kind="vision", provider=vision.name,
                   # Bild-IDs statt Pfaden: sechs Pfade sprengen die 500 Zeichen
                   input_ref=",".join(f.id for f in fotos)[:500],
                   raw=analysis.model_dump(mode="json"),
                   validated=analysis.model_dump(mode="json"),
                   confidence=analysis.confidence, started=started, verbrauch=verbrauch)

    product.processing_status = ProcessingStatus.PRODUCT_IDENTIFIED.value
    _refresh_questions(db, product, conflicts)

    # Recherche nur, wenn es etwas zu suchen gibt — und bei einer erneuten
    # Erkennung (weiteres Foto) nur, wenn sich Name/Modell/EAN geaendert haben.
    # Jede Recherche kostet Websuchen.
    schon_recherchiert = db.scalar(select(AiRun.id).where(
        AiRun.product_id == product.id, AiRun.kind == "product_research").limit(1))
    recherche = bool(product.ean or product.mpn or product.product_name) and \
        (not schon_recherchiert or _merkmale(product) != vorher)
    if recherche:
        # Der Shoptext folgt erst nach der Recherche – mit ihren Angaben und
        # nur einmal statt vorher und nachher.
        _einplanen(db, product, JobType.RESEARCH_PRODUCT.value)
    else:
        schon_text = db.scalar(select(AiRun.id).where(
            AiRun.product_id == product.id, AiRun.kind == "shoptext",
            AiRun.status == "ok").limit(1))
        if not schon_text or _merkmale(product) != vorher:
            _shoptext_einplanen(db, product)
        else:
            # Kein weiterer Schritt folgt – sonst bliebe der Artikel für immer
            # auf „Produkt erkannt“ stehen.
            _pruefen_lassen(product)
    queue.enqueue(db, job_type=JobType.OPTIMIZE_IMAGES.value,
                  payload={"product_id": product.id}, product_id=product.id)
    db.commit()


def ki_fortsetzen(db: Session, product: Product) -> list[str]:
    """Nach einer Budget-Freigabe die fehlenden KI-Schritte einplanen."""
    def fertig(kind: str) -> bool:
        return db.scalar(select(AiRun.id).where(
            AiRun.product_id == product.id, AiRun.kind == kind,
            AiRun.status == "ok").limit(1)) is not None

    geplant: list[str] = []
    if not fertig("vision"):
        _einplanen(db, product, JobType.RECOGNIZE_PRODUCT.value)
        return [JobType.RECOGNIZE_PRODUCT.value]
    if (product.ean or product.mpn or product.product_name) and not fertig("product_research"):
        # Die Recherche plant Preise und Shoptext selbst ein.
        _einplanen(db, product, JobType.RESEARCH_PRODUCT.value)
        return [JobType.RESEARCH_PRODUCT.value]
    if get_settings().preisrecherche_automatisch and fertig("product_research") \
            and not fertig("price_research"):
        _einplanen(db, product, JobType.RESEARCH_PRICES.value)
        geplant.append(JobType.RESEARCH_PRICES.value)
    if not fertig("shoptext"):
        _shoptext_einplanen(db, product)
        geplant.append(JobType.GENERATE_SHOPTEXT.value)
    return geplant


# ── Produktrecherche ─────────────────────────────────────────────────────────

def handle_research_product(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    started = time.monotonic()
    query = " ".join(filter(None, [product.manufacturer, product.product_name,
                                   product.model])) or None
    frueher = (_letzter_lauf(db, kind="product_research", input_ref=product.ean,
                             gueltig=PRODUKTRECHERCHE_GUELTIG) if product.ean else None)
    datenbank = (_aus_produktdatenbank(product)
                 if frueher is None and product.ean and get_settings().produktdatenbanken
                 else None)
    if frueher is not None:
        # Dieselbe EAN wurde gerade erst recherchiert: Ergebnis übernehmen.
        candidates = _gueltige_kandidaten(frueher.validated_output.get("items"))
        _record_ai_run(db, product_id=product.id, kind="product_research",
                       provider="wiederverwendet", input_ref=product.ean,
                       raw={"count": len(candidates), "quelle": frueher.id},
                       validated={"items": [c.model_dump(mode="json") for c in candidates]},
                       confidence={}, started=started)
    elif datenbank is not None:
        # Kostenloser Treffer in einer offenen Produktdatenbank – keine Websuche.
        candidates = [datenbank]
        _record_ai_run(db, product_id=product.id, kind="product_research",
                       provider="produktdatenbank", input_ref=product.ean,
                       raw={"count": 1, "quelle": datenbank.source_url},
                       validated={"items": [datenbank.model_dump(mode="json")]},
                       confidence={}, started=started)
    elif _ueber_budget(db, product, "product_research"):
        if queue.wartet(db, product_id=product.id, job_type=JobType.GENERATE_SHOPTEXT.value) \
                or not db.scalar(select(AiRun.id).where(
                    AiRun.product_id == product.id, AiRun.kind == "shoptext",
                    AiRun.status == "ok").limit(1)):
            _shoptext_einplanen(db, product)
        else:
            _pruefen_lassen(product)
        db.commit()
        return
    else:
        research_name = "research"
        with ki_verbrauch.messen() as verbrauch:
            try:
                research = get_research()
                research_name = research.name
                candidates = research.identify_product(ean=product.ean, mpn=product.mpn,
                                                       query=query)
            except Exception as exc:
                _kosten_trotz_fehler(db, product_id=product.id, kind="product_research",
                                     provider=research_name, verbrauch=verbrauch, exc=exc,
                                     started=started)
                if not _aufgeben(job, exc, "Produktrecherche"):
                    raise
                # Recherche ist eine Ergaenzung — ohne sie bleibt es bei Foto und Eingabe.
                _shoptext_einplanen(db, product)
                db.commit()
                return
        _record_ai_run(db, product_id=product.id, kind="product_research",
                       provider=research_name, input_ref=product.ean or product.mpn,
                       raw={"count": len(candidates)},
                       validated={"items": [c.model_dump(mode="json") for c in candidates]},
                       confidence={}, started=started, verbrauch=verbrauch)

    conflicts: list[str] = []
    eindeutig = _eindeutiger_treffer(candidates)
    if eindeutig is not None:
        conflicts = merge_service.merge_research(product, eindeutig)
        product.research_candidates = []
    elif candidates:
        # Kein klarer Treffer → nie raten, der Benutzer waehlt aus.
        product.research_candidates = [c.model_dump(mode="json") for c in candidates[:5]]
    _refresh_questions(db, product, conflicts)

    if get_settings().preisrecherche_automatisch:
        _einplanen(db, product, JobType.RESEARCH_PRICES.value)
    _shoptext_einplanen(db, product)
    db.commit()


def _aus_produktdatenbank(product: Product) -> ResearchCandidate | None:
    """EAN in Open Food Facts & Co. nachschlagen; Fehler bremsen nie die Kette."""
    try:
        erkannt = " ".join(filter(None, [product.brand, product.manufacturer,
                                         product.product_name]))
        return produktdatenbanken.nachschlagen(product.ean,
                                               name_bekannt=bool(product.product_name),
                                               erkannt=erkannt)
    except Exception:
        log.exception("Produktdatenbanken: Abfrage fehlgeschlagen")
        return None


def _gueltige_kandidaten(eintraege) -> list[ResearchCandidate]:
    ergebnis = []
    for eintrag in eintraege or []:
        try:
            ergebnis.append(ResearchCandidate.model_validate(eintrag))
        except Exception:
            continue
    return ergebnis


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

    started = time.monotonic()
    query = " ".join(filter(None, [product.manufacturer, product.product_name, product.model]))
    schluessel = f"{product.ean}|{product.condition or ''}" if product.ean else None
    frueher = (_letzter_lauf(db, kind="price_research", input_ref=schluessel,
                             gueltig=PREISRECHERCHE_GUELTIG)
               # „Marktpreise aktualisieren“ will ausdrücklich frische Preise.
               if schluessel and not job.payload.get("frisch") else None)
    if frueher is not None:
        offers = _gueltige_angebote(frueher.validated_output.get("items"))
        pricing_service.evaluate_offers(db, product=product, offers=offers)
        _record_ai_run(db, product_id=product.id, kind="price_research",
                       provider="wiederverwendet", input_ref=schluessel,
                       raw={"count": len(offers), "quelle": frueher.id},
                       validated={"items": [o.model_dump(mode="json") for o in offers]},
                       confidence={}, started=started)
    elif (product.ean or query) and not _ueber_budget(db, product, "price_research"):
        research_name = "research"
        with ki_verbrauch.messen() as verbrauch:
            try:
                research = get_research()
                research_name = research.name
                offers = research.find_offers(ean=product.ean, query=query,
                                              condition=product.condition)
                pricing_service.evaluate_offers(db, product=product, offers=offers)
                _record_ai_run(db, product_id=product.id, kind="price_research",
                               provider=research_name, input_ref=schluessel or query[:500],
                               raw={"count": len(offers)},
                               validated={"items": [o.model_dump(mode="json") for o in offers]},
                               confidence={}, started=started, verbrauch=verbrauch)
            except Exception as exc:
                _kosten_trotz_fehler(db, product_id=product.id, kind="price_research",
                                     provider=research_name, verbrauch=verbrauch, exc=exc,
                                     started=started)
                if not _aufgeben(job, exc, "Preisrecherche"):
                    raise
    # Auch ohne Recherche weiter zur Pruefung — sonst haengt der Artikel.
    product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value
    _refresh_questions(db, product, [])
    db.commit()


def _gueltige_angebote(eintraege) -> list[PriceOffer]:
    ergebnis = []
    for eintrag in eintraege or []:
        try:
            ergebnis.append(PriceOffer.model_validate(eintrag))
        except Exception:
            continue
    return ergebnis


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
    started = time.monotonic()
    if _ueber_budget(db, product, "extraction"):
        # Das Gesagte bleibt am Artikel lesbar (voice_transcript), nur ohne Auswertung.
        recording.status = "transcribed"
        db.commit()
        return
    llm_name = "llm"
    with ki_verbrauch.messen() as verbrauch:
        try:
            llm = get_llm()
            llm_name = llm.name
            extraction = llm.extract_voice_data(recording.transcript)
        except Exception as exc:
            _kosten_trotz_fehler(db, product_id=product.id, kind="extraction", provider=llm_name,
                                 verbrauch=verbrauch, exc=exc, started=started)
            if not _aufgeben(job, exc, "Sprachauswertung"):
                raise
            recording.status = "transcribed"
            db.commit()
            return
    conflicts = merge_service.merge_voice(db, product, extraction)
    _record_ai_run(db, product_id=product.id, kind="extraction", provider=llm.name,
                   input_ref=recording.id, raw=extraction.model_dump(mode="json"),
                   validated=extraction.model_dump(mode="json"),
                   confidence=extraction.confidence, started=started, verbrauch=verbrauch)
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
    vorher = product.processing_status
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
        key = medien.schluessel_shopbild(original.storage_key)
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
    # Der Shoptext wird nach Erkennung bzw. Recherche eingeplant, nicht hier:
    # er braucht die Bilder nicht, aber deren Angaben.
    # Die Bildoptimierung ist ein Nebenschritt: danach gilt wieder der Stand
    # von vorher (sonst bliebe „Bilder werden optimiert“ stehen, wenn sie als
    # letzter Auftrag läuft).
    if product.processing_status == ProcessingStatus.IMAGES_OPTIMIZING.value:
        product.processing_status = (vorher if vorher != ProcessingStatus.IMAGES_OPTIMIZING.value
                                     else ProcessingStatus.REVIEW_REQUIRED.value)
    db.commit()


# ── Shoptext / Veröffentlichung / Bestandssync ───────────────────────────────

def handle_generate_shoptext(db: Session, job: Job) -> None:
    product = db.get(Product, job.payload["product_id"])
    if product is None:
        return
    if _ueber_budget(db, product, "shoptext"):
        product.processing_status = ProcessingStatus.REVIEW_REQUIRED.value
        _refresh_questions(db, product, [])
        db.commit()
        return
    product.processing_status = ProcessingStatus.SHOPTEXT_GENERATING.value
    db.commit()
    started = time.monotonic()
    with ki_verbrauch.messen() as verbrauch:
        try:
            listing = listing_service.generate(db, product)
            _record_ai_run(db, product_id=product.id, kind="shoptext", provider=get_llm().name,
                           input_ref=None, raw={}, validated={"seo_title": listing.seo_title},
                           confidence={}, started=started, verbrauch=verbrauch)
        except Exception as exc:
            _kosten_trotz_fehler(db, product_id=product.id, kind="shoptext",
                                 provider="llm", verbrauch=verbrauch, exc=exc, started=started)
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
    if publication.status == "delisted":
        return  # im Shop ausgeblendet oder gelöscht – dort gibt es nichts abzugleichen
    product = db.get(Product, publication.product_id)
    connection = db.get(ShopConnection, publication.connection_id)
    if product is None or connection is None or not connection.is_active:
        return
    connector = build_connector(connection)
    if connector.manuell:
        # Kein Zugriff aufs Portal: ausverkauft → Aufgabe „Anzeige löschen“.
        from app.services import kanaele
        kanaele.manuell_nachziehen(publication, product)
    else:
        connector.update_stock(publication.external_id, product.available_quantity)
    db.commit()


def handle_marktplatz_abgleich(db: Session, job: Job) -> None:
    """Verkäufe eines Marktplatzes abholen und sich selbst neu einplanen."""
    from app.models import ShopConnection
    from app.services import ebay_konto
    connection = db.get(ShopConnection, job.payload.get("connection_id"))
    if connection is None or not connection.is_active or connection.connector_type != "ebay":
        return  # Verbindung gelöscht oder abgeschaltet → Kette endet
    if not ebay_konto.zugangsdaten(connection).get("refresh_token"):
        return
    try:
        ergebnis = ebay_konto.verkaeufe_abholen(db, connection)
        log.info("Marktplatz %s: %s", connection.name, ergebnis)
        db.commit()
    except Exception:
        # Ein Aussetzer (eBay nicht erreichbar …) beendet die Kette nicht; der
        # nächste Abruf holt nach, das Abruffenster überlappt.
        db.rollback()
        log.exception("Marktplatz-Abruf %s fehlgeschlagen", connection.name)
    ebay_konto.abruf_einplanen(db, connection, ausser=job.id,
                               verzoegerung=get_settings().ebay_bestellabruf_minuten * 60)
    db.commit()


def handle_bestellung_weitergeben(db: Session, job: Job) -> None:
    """Marktplatzbestellung in den Shop-Admin geben. Fehler → erneuter Versuch."""
    from app.connectors.registry import build_connector
    from app.models import ShopConnection
    shop = db.get(ShopConnection, job.payload.get("shop_connection_id"))
    if shop is None or not shop.is_active:
        return
    ergebnis = build_connector(shop).bestellung_uebernehmen(job.payload["bestellung"])
    log.info("Bestellung %s an den Shop: %s", job.payload["bestellung"].get("bestellnummer"), ergebnis)


def handle_versand_melden(db: Session, job: Job) -> None:
    """Sendungsnummer beim Marktplatz eintragen. Fehler → erneuter Versuch."""
    from app.services import ebay_konto
    p = job.payload
    if p.get("quelle") != "ebay":
        return
    ebay_konto.versand_eintragen(db, p["bestellnummer"], p["sendungsnummer"], p.get("versender", ""))
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
    JobType.MARKTPLATZ_ABGLEICH.value: handle_marktplatz_abgleich,
    JobType.BESTELLUNG_WEITERGEBEN.value: handle_bestellung_weitergeben,
    JobType.VERSAND_MELDEN.value: handle_versand_melden,
}
