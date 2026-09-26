"""Shoptext-Erzeugung (Anforderung 15): Der LLM-Prompt erhält verifizierte und
unverifizierte Felder getrennt; unverifizierte dürfen nicht als Fakten erscheinen.

Der Text ist für Kunden. Interne Bemerkungen gehen deshalb gar nicht erst an die KI,
und was sie trotzdem an Prüf- oder Foto-Vorbehalten schreibt, entfernt
`bereinigen()` vor dem Speichern.
"""
import re

from slugify import slugify
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Product, ShopListing
from app.models.base import utcnow
from app.providers.registry import get_llm

# Bewusst ohne "notes": Bemerkungen sind intern („Flaschenhals verschmutzt, prüfen“).
_TEXT_FIELDS = [
    "product_name", "manufacturer", "brand", "model", "mpn", "ean", "category",
    "subcategory", "condition", "packaging_condition",
    "net_content_amount", "net_content_unit", "units_per_pack", "deposit_amount",
    "deposit_type", "ingredients", "allergens", "food_notes",
]

# Sätze über die Erfassung selbst oder mit Vorbehalten gehören nicht in den Shop.
_INTERN = re.compile(
    r"nicht\s+(?:vollständig\s+|abschließend\s+|eindeutig\s+|für\s+[^.;]{0,40}?)?"
    r"(?:geprüft|überprüft|bestätigt|verifiziert|gesichert|erkennbar)"
    r"|\bunverifiziert|\bunbestätigt|\bungeprüft"
    r"|\b(?:auf|in)\s+(?:dem|einem|den|diesem)\s+(?:vorliegenden\s+)?Fotos?\b"
    r"|\bvorliegenden?\s+Fotos?\b|\bFotos?\s+(?:zeigt|zeigen|ist|sind)\b"
    r"|\blaut\s+(?:Foto|Aufdruck|Etikett|Recherche|Quelle)"
    r"|\bkönnen\s+[^.;]{0,80}\bversehen\s+sein",
    re.IGNORECASE,
)
_KLAMMER_INTERN = re.compile(r"\s*\((?:laut\s+)?(?:Aufdruck|Etikett|Foto|Angabe auf dem Etikett)\)", re.IGNORECASE)
_STICHPUNKT_INTERN = re.compile(r"^\s*(?:Kategorie|Produktkategorie|Unterkategorie)\s*:", re.IGNORECASE)
_SATZENDE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])")
# Nach diesen Abkürzungen endet kein Satz („… Verschmutzungen bzw. Rückstände …“).
_ABKUERZUNG = re.compile(
    r"\b(?:bzw|ca|ggf|inkl|zzgl|evtl|usw|etc|vgl|max|min|Nr|Art|Tel|St|Stk|z\.\s?B|u\.\s?a|d\.\s?h|o\.\s?Ä)\.$",
    re.IGNORECASE)


def _saetze(text: str) -> list[str]:
    saetze: list[str] = []
    for teil in _SATZENDE.split(text):
        if saetze and _ABKUERZUNG.search(saetze[-1]):
            saetze[-1] += " " + teil
        else:
            saetze.append(teil)
    return saetze


def _saetze_bereinigen(text: str) -> str:
    text = _KLAMMER_INTERN.sub("", text)
    return " ".join(satz for satz in _saetze(text) if not _INTERN.search(satz)).strip()


def bereinigen(html: str | None) -> str | None:
    """Prüf-/Foto-Vorbehalte und interne Einordnungen aus einem Shoptext entfernen.

    Arbeitet satzweise in <p> und je Listenpunkt in <li>; leere Absätze und Listen
    fallen weg. Klartext ohne HTML wird genauso behandelt.
    """
    if not html:
        return html

    def absatz(treffer: re.Match) -> str:
        inhalt = _saetze_bereinigen(treffer.group(2))
        return f"<{treffer.group(1)}>{inhalt}</{treffer.group(1)}>" if inhalt else ""

    def punkt(treffer: re.Match) -> str:
        inhalt = treffer.group(1)
        if _STICHPUNKT_INTERN.search(inhalt) or _INTERN.search(inhalt):
            return ""
        return f"<li>{_KLAMMER_INTERN.sub('', inhalt)}</li>"

    if "<" not in html:
        return _saetze_bereinigen(html) or None
    ergebnis = re.sub(r"<(p)>(.*?)</p>", absatz, html, flags=re.S)
    ergebnis = re.sub(r"<li>(.*?)</li>", punkt, ergebnis, flags=re.S)
    ergebnis = re.sub(r"<(ul|ol)>\s*</\1>", "", ergebnis)
    return ergebnis.strip() or None


def stichpunkte_bereinigen(punkte: list[str]) -> list[str]:
    ergebnis = []
    for punkt in punkte:
        if _STICHPUNKT_INTERN.search(punkt) or _INTERN.search(punkt):
            continue
        punkt = _KLAMMER_INTERN.sub("", punkt).strip()
        if punkt:
            ergebnis.append(punkt)
    return ergebnis


def split_fields(product: Product) -> tuple[dict, dict]:
    """Verifiziert = Quelle user/research oder Confidence ≥ Schwellwert."""
    threshold = get_settings().confidence_threshold
    sources = product.field_sources or {}
    confidence = product.field_confidence or {}
    verified: dict = {}
    unverified: dict = {}
    for field in _TEXT_FIELDS:
        value = getattr(product, field, None)
        if value in (None, "", {}):
            continue
        if sources.get(field) in ("user", "research") or confidence.get(field, 0.0) >= threshold:
            verified[field] = value
        else:
            unverified[field] = value
    for name, data in (("attributes", product.attributes), ("technical_data", product.technical_data)):
        if data:
            (verified if sources.get(name) in ("user", "research") else unverified)[name] = data
    return verified, unverified


def generate(db: Session, product: Product) -> ShopListing:
    verified, unverified = split_fields(product)
    generation = get_llm().generate_shop_text(verified, unverified)

    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    if listing is None:
        listing = ShopListing(product_id=product.id)
        db.add(listing)

    listing.seo_title = generation.seo_title[:255]
    listing.short_description = bereinigen(generation.short_description)
    listing.long_description = bereinigen(generation.long_description)
    listing.bullet_points = stichpunkte_bereinigen(generation.bullet_points)[:6]
    listing.scope_of_delivery = generation.scope_of_delivery
    listing.condition_note = bereinigen(generation.condition_note)
    listing.meta_title = generation.meta_title[:255]
    listing.meta_description = generation.meta_description[:500]
    # Slug immer serverseitig normalisieren — LLM-Ausgabe nie ungeprüft übernehmen.
    listing.url_slug = slugify(generation.url_slug or generation.seo_title)[:255]
    listing.tags = generation.tags[:10]
    listing.suggested_price = product.recommended_sale_price
    listing.generated_at = utcnow()
    return listing
