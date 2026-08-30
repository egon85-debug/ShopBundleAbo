"""Datenzusammenführung (Anforderung 10): Foto-KI, Recherche und Spracheingabe werden
in den Produkt-Entwurf gemerged. Vorrangregel: user > research > ai. Unsichere Werte
werden über field_confidence markiert; EAN wird nur mit gültiger Prüfziffer übernommen."""
from datetime import date

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Product
from app.schemas.ai import ResearchCandidate, VisionAnalysis, VoiceExtraction
from app.services import location_service, supplier_service
from app.utils.ean import is_valid_gtin, normalize_gtin

_SOURCE_RANK = {"ai": 0, "research": 1, "user": 2}


def _set_field(product: Product, field: str, value, *, source: str, confidence: float) -> bool:
    """Setzt ein Feld nur, wenn die neue Quelle mindestens gleichrangig ist.
    Benutzerwerte werden nie von KI/Recherche überschrieben."""
    if value is None or value == "" or value == {} or value == []:
        return False
    sources = dict(product.field_sources or {})
    existing_rank = _SOURCE_RANK.get(sources.get(field, ""), -1)
    if _SOURCE_RANK[source] < existing_rank:
        return False
    if existing_rank == _SOURCE_RANK[source] and getattr(product, field, None) not in (None, "", {}, []):
        # gleiche Quelle: nur überschreiben, wenn Confidence höher
        conf = dict(product.field_confidence or {})
        if confidence <= conf.get(field, 0.0):
            return False
    setattr(product, field, value)
    sources[field] = source
    confs = dict(product.field_confidence or {})
    confs[field] = round(confidence, 3)
    product.field_sources = sources
    product.field_confidence = confs
    return True


def merge_vision(product: Product, analysis: VisionAnalysis) -> list[str]:
    """Foto-/KI-Erkennung einarbeiten. Rückgabe: Liste erkannter Konflikte."""
    conflicts: list[str] = []
    conf = analysis.confidence

    ean = normalize_gtin(analysis.ean)
    if ean:
        if not is_valid_gtin(ean):
            conflicts.append(f"Erkannte EAN {ean} hat eine ungültige Prüfziffer.")
        elif product.ean and product.ean != ean and (product.field_sources or {}).get("ean") != "ai":
            conflicts.append(f"Foto-EAN {ean} weicht von vorhandener EAN {product.ean} ab.")
        else:
            _set_field(product, "ean", ean, source="ai", confidence=conf.get("ean", 0.9))

    upc = normalize_gtin(analysis.upc)
    if upc and is_valid_gtin(upc):
        _set_field(product, "upc", upc, source="ai", confidence=conf.get("upc", 0.8))

    mapping = {
        "manufacturer": analysis.manufacturer,
        "brand": analysis.brand,
        "product_name": analysis.product_name,
        "model": analysis.model or analysis.model_number,
        "mpn": analysis.mpn,
        "category": analysis.category,
        "subcategory": analysis.subcategory,
    }
    for field, value in mapping.items():
        _set_field(product, field, value, source="ai", confidence=conf.get(field, 0.6))

    attributes = dict(product.attributes or {})
    for key, value in {"color": analysis.color, "size": analysis.size,
                       "variant": analysis.variant}.items():
        if value:
            attributes[key] = value
    if analysis.other_features:
        attributes["features"] = analysis.other_features
    if attributes != (product.attributes or {}):
        product.attributes = attributes

    if analysis.technical_data:
        merged = dict(product.technical_data or {})
        merged.update(analysis.technical_data)
        product.technical_data = merged

    if analysis.visible_condition:
        notes = product.notes or ""
        marker = f"Sichtbarer Zustand (Foto): {analysis.visible_condition}"
        if marker not in notes:
            product.notes = (notes + "\n" + marker).strip()

    return conflicts


def merge_research(product: Product, candidate: ResearchCandidate) -> list[str]:
    """Eindeutigen (oder vom Benutzer gewählten) Recherche-Treffer einarbeiten."""
    conflicts: list[str] = []
    ean = normalize_gtin(candidate.ean)
    if ean and is_valid_gtin(ean):
        if product.ean and product.ean != ean:
            conflicts.append(
                f"Auf dem Foto wurde EAN {product.ean} erkannt, die Online-Recherche "
                f"deutet jedoch auf EAN {ean} hin. Welche ist korrekt?"
            )
        else:
            _set_field(product, "ean", ean, source="research", confidence=candidate.match_score)

    score = candidate.match_score
    _set_field(product, "product_name", candidate.product_name, source="research", confidence=score)
    _set_field(product, "manufacturer", candidate.manufacturer, source="research", confidence=score)
    _set_field(product, "brand", candidate.brand, source="research", confidence=score)
    _set_field(product, "mpn", candidate.mpn, source="research", confidence=score)
    _set_field(product, "category", candidate.category, source="research", confidence=score)
    _set_field(product, "long_description", candidate.description, source="research", confidence=score)
    if candidate.technical_data:
        merged = dict(product.technical_data or {})
        for key, value in candidate.technical_data.items():
            merged.setdefault(key, value)
        product.technical_data = merged
    if candidate.attributes:
        merged = dict(product.attributes or {})
        for key, value in candidate.attributes.items():
            merged.setdefault(key, value)
        product.attributes = merged
    return conflicts


def merge_voice(db: Session, product: Product, extraction: VoiceExtraction) -> list[str]:
    """Spracheingabe einarbeiten. Gesprochene Werte sind Aussagen des Mitarbeiters,
    werden aber bis zur Bestätigung als 'ai' geführt (STT/Extraktion kann irren)."""
    conflicts: list[str] = []
    conf = extraction.confidence

    if extraction.stock is not None:
        _set_field(product, "stock_quantity", extraction.stock, source="ai",
                   confidence=conf.get("stock", 0.8))
    for field in ("purchase_price_net", "purchase_price_gross", "sale_price",
                  "minimum_sale_price"):
        _set_field(product, field, getattr(extraction, field), source="ai",
                   confidence=conf.get(field, 0.8))
    for field in ("invoice_number", "batch_number", "serial_number",
                  "packaging_condition"):
        _set_field(product, field, getattr(extraction, field), source="ai",
                   confidence=conf.get(field, 0.8))
    if extraction.condition:
        _set_field(product, "condition", extraction.condition, source="ai",
                   confidence=conf.get("condition", 0.8))
    if extraction.purchase_date:
        try:
            _set_field(product, "purchase_date", date.fromisoformat(extraction.purchase_date),
                       source="ai", confidence=conf.get("purchase_date", 0.8))
        except ValueError:
            conflicts.append(f"Einkaufsdatum '{extraction.purchase_date}' ist kein gültiges Datum.")

    if extraction.supplier_name:
        supplier = supplier_service.match_or_create(db, extraction.supplier_name)
        _set_field(product, "supplier_id", supplier.id, source="ai",
                   confidence=conf.get("supplier_name", 0.8))

    if extraction.storage_location_spoken:
        location = location_service.resolve_spoken(db, extraction.storage_location_spoken)
        if location:
            _set_field(product, "storage_location_id", location.id, source="ai",
                       confidence=conf.get("storage_location_spoken", 0.8))
        else:
            conflicts.append(
                f"Lagerplatz '{extraction.storage_location_spoken}' konnte nicht zugeordnet werden."
            )

    note_parts = [p for p in (extraction.notes, extraction.origin) if p]
    if extraction.damaged_count:
        note_parts.append(f"{extraction.damaged_count} Artikel beschädigt")
    if note_parts:
        notes = product.notes or ""
        addition = " | ".join(p for p in note_parts if p not in notes)
        if addition:
            product.notes = (notes + "\n" + addition).strip()

    return conflicts


def low_confidence_fields(product: Product) -> list[str]:
    threshold = get_settings().confidence_threshold
    sources = product.field_sources or {}
    return sorted(
        field for field, value in (product.field_confidence or {}).items()
        if value < threshold and sources.get(field) != "user"
    )
