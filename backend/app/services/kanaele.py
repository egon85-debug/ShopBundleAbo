"""Vertriebskanäle: auf welchen Portalen ein Artikel erscheint.

Ein Kanal ist eine Shop-Verbindung (eigener Shop, WooCommerce, eBay, Amazon,
Kleinanzeigen …). Nach der Erfassung wählt man die Kanäle (Product.kanaele),
bei der Freigabe wird auf allen gewählten veröffentlicht. Kanäle ohne
Schnittstelle (Connector.manuell, z. B. Kleinanzeigen) werden nur vorbereitet;
ein Mensch stellt die Anzeige ein und bestätigt das.

Der Bestand gilt für alle Kanäle gemeinsam: Jede Bestandsänderung wird an jede
Veröffentlichung weitergegeben, damit nichts doppelt verkauft wird.
"""
import html
import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.registry import build_connector, connector_klasse
from app.jobs import queue
from app.models import (
    ImageKind,
    JobType,
    Product,
    ProductImage,
    PublicationStatusEnum,
    ShopConnection,
    ShopListing,
    ShopPublication,
    User,
)
from app.models.base import utcnow
from app.services import audit_service, medien, quality_service

AKTIV = (PublicationStatusEnum.PENDING.value, PublicationStatusEnum.PUBLISHED.value,
         PublicationStatusEnum.VORBEREITET.value, PublicationStatusEnum.ZU_LOESCHEN.value)


MANUELL_PFLICHT = {"Produktname", "Verkaufspreis", "Bestand", "Mindestens ein optimiertes Produktbild"}


class KanalFehler(Exception):
    """Artikel kann auf diesem Kanal (noch) nicht erscheinen."""

    def __init__(self, text: str, fehlt: list[str] | None = None):
        super().__init__(text)
        self.fehlt = fehlt or []


def ist_manuell(connection: ShopConnection) -> bool:
    cls = connector_klasse(connection.connector_type)
    return bool(cls and cls.manuell)


def anzeige_name(connection: ShopConnection) -> str:
    cls = connector_klasse(connection.connector_type)
    return (cls.anzeige_name if cls and cls.anzeige_name else connection.connector_type)


def kanal_liste(db: Session) -> list[dict]:
    """Aktive Kanäle für die Auswahl in App und Lager-Web (ohne Zugangsdaten)."""
    verbindungen = db.scalars(select(ShopConnection).where(ShopConnection.is_active.is_(True))
                              .order_by(ShopConnection.name)).all()
    return [{"id": c.id, "name": c.name, "connector_type": c.connector_type,
             "portal": anzeige_name(c), "manuell": ist_manuell(c)} for c in verbindungen]


def kanaele_setzen(db: Session, product: Product, ids: list[str], *, user: User) -> list[str]:
    gueltig = {c.id for c in db.scalars(select(ShopConnection).where(
        ShopConnection.id.in_(ids), ShopConnection.is_active.is_(True))).all()} if ids else set()
    unbekannt = [i for i in ids if i not in gueltig]
    if unbekannt:
        raise KanalFehler("Unbekannter oder inaktiver Kanal")
    # Reihenfolge der Eingabe, ohne Doppelte.
    neu = list(dict.fromkeys(ids))
    if neu != list(product.kanaele or []):
        audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                          action="kanaele", old_value=",".join(product.kanaele or []),
                          new_value=",".join(neu))
        product.kanaele = neu
    return neu


def veroeffentlichen(db: Session, product: Product, connection: ShopConnection,
                     *, user: User) -> ShopPublication:
    """Auf einem Kanal veröffentlichen (bzw. bei manuellen Kanälen vorbereiten).

    Wirft KanalFehler, wenn der Artikel für diesen Kanal noch nicht bereit ist.
    """
    if not connection.is_active:
        raise KanalFehler(f"{connection.name} ist inaktiv")
    connector = build_connector(connection)
    fehlt = quality_service.check_shop_ready(db, product, connector.required_fields())
    if connector.manuell:
        # Eine Kleinanzeige braucht keine Shop-Kategorie und keinen Shoptext –
        # nur, was in jede Anzeige gehört.
        fehlt = [f for f in fehlt if f in MANUELL_PFLICHT]
    if fehlt:
        raise KanalFehler("Produkt noch nicht shopbereit", fehlt)

    bestehend = db.scalar(select(ShopPublication).where(
        ShopPublication.product_id == product.id,
        ShopPublication.connection_id == connection.id,
        ShopPublication.status.in_(AKTIV)))
    publication = bestehend or ShopPublication(
        product_id=product.id, connection_id=connection.id, published_by=user.id)
    if bestehend is None:
        db.add(publication)
        db.flush()

    if connector.manuell:
        # Nur vorbereiten – eingestellt wird von Hand (Assistent im Lager-Web).
        if publication.status == PublicationStatusEnum.PENDING.value:
            publication.status = PublicationStatusEnum.VORBEREITET.value
    else:
        product.publication_status = "publishing"
        queue.enqueue(db, job_type=JobType.PUBLISH_PRODUCT.value,
                      payload={"publication_id": publication.id}, product_id=product.id)
    audit_service.log(db, user=user, entity_type="product", entity_id=product.id,
                      action="publish", new_value=connection.name)
    return publication


def alle_gewaehlten_veroeffentlichen(db: Session, product: Product, *, user: User) -> list[dict]:
    """Freigabe: auf allen gewählten Kanälen veröffentlichen. Ein Kanal, der
    (noch) nicht geht, hält die anderen nicht auf."""
    ergebnisse = []
    for connection_id in product.kanaele or []:
        connection = db.get(ShopConnection, connection_id)
        if connection is None:
            continue
        eintrag = {"connection_id": connection.id, "name": connection.name,
                   "portal": anzeige_name(connection), "manuell": ist_manuell(connection)}
        try:
            publication = veroeffentlichen(db, product, connection, user=user)
            eintrag.update(status=publication.status, publication_id=publication.id)
        except KanalFehler as exc:
            eintrag.update(status="fehlt", fehler=str(exc), fehlt=exc.fehlt)
        except Exception as exc:  # Zugangsdaten o. Ä. – die anderen Kanäle laufen weiter
            eintrag.update(status="fehler", fehler=str(exc)[:300])
        ergebnisse.append(eintrag)
    return ergebnisse


def bestand_nachziehen(db: Session, product: Product) -> int:
    """Bestandsänderung an jede Veröffentlichung des Artikels weitergeben."""
    publikationen = db.scalars(select(ShopPublication).where(
        ShopPublication.product_id == product.id,
        ShopPublication.status.in_((PublicationStatusEnum.PUBLISHED.value,
                                    PublicationStatusEnum.ZU_LOESCHEN.value)))).all()
    for publication in publikationen:
        queue.enqueue(db, job_type=JobType.SYNC_STOCK.value,
                      payload={"publication_id": publication.id}, product_id=product.id)
    return len(publikationen)


def manuell_nachziehen(publication: ShopPublication, product: Product) -> None:
    """Manueller Kanal: ausverkauft → Anzeige löschen lassen; wieder da, bevor
    jemand gelöscht hat → Anzeige bleibt einfach stehen."""
    if product.available_quantity <= 0 and publication.status == PublicationStatusEnum.PUBLISHED.value:
        publication.status = PublicationStatusEnum.ZU_LOESCHEN.value
    elif product.available_quantity > 0 and publication.status == PublicationStatusEnum.ZU_LOESCHEN.value:
        publication.status = PublicationStatusEnum.PUBLISHED.value


# ── Kleinanzeigen-Assistent ────────────────────────────────────────────────

TITEL_MAX = 65
TEXT_MAX = 4000
_ZUSTAND = {"new": "Neu", "new_opened": "Neu, geöffnet (unbenutzt)", "refurbished": "Generalüberholt",
            "used": "Gebraucht", "defective": "Defekt", "unknown": None}


def _klartext(text: str | None) -> str:
    """Shop-HTML (<p>, <ul>, <li>) → Text mit Absätzen und Aufzählungszeichen."""
    if not text:
        return ""
    if not re.search(r"</?[a-z][^>]*>", text, re.I):
        return text.strip()
    t = text.replace("\r", "").replace("\n", " ")
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<li[^>]*>", "\n• ", t, flags=re.I)
    t = re.sub(r"</?(p|div|ul|ol|h[1-6])(\s[^>]*)?>", "\n\n", t, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    zeilen = [re.sub(r"[ \t]+", " ", z).strip() for z in t.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(zeilen)).strip()


def _kuerzen(text: str, grenze: int) -> str:
    if len(text) <= grenze:
        return text
    return text[: grenze - 1].rsplit(" ", 1)[0].rstrip(" ,;–-") + "…"


def kleinanzeigen_entwurf(db: Session, product: Product) -> dict:
    listing = db.scalar(select(ShopListing).where(ShopListing.product_id == product.id))
    titel = _kuerzen(((listing.seo_title if listing else None) or product.product_name or "").strip(),
                     TITEL_MAX)
    teile = [_klartext((listing.long_description if listing else None) or product.long_description)]
    punkte = [p for p in (listing.bullet_points if listing else []) or [] if p]
    if punkte and not any(p in teile[0] for p in punkte):
        teile.append("\n".join(f"• {p}" for p in punkte))
    zustand = _ZUSTAND.get(product.condition or "unknown")
    angaben = [f"Zustand: {zustand}" if zustand else None,
               f"Hersteller: {product.manufacturer}" if product.manufacturer else None,
               f"Modell: {product.model}" if product.model else None,
               f"EAN: {product.ean}" if product.ean else None]
    if any(angaben):
        teile.append("\n".join(a for a in angaben if a))
    text = _kuerzen("\n\n".join(t for t in teile if t), TEXT_MAX)

    bilder = db.scalars(select(ProductImage).where(
        ProductImage.product_id == product.id, ProductImage.kind == ImageKind.OPTIMIZED.value)
        .order_by(ProductImage.is_primary.desc(), ProductImage.sort_order)).all()
    preis = product.sale_price
    return {
        "titel": titel,
        "text": text,
        "preis": str(preis.quantize(Decimal("0.01"))) if preis is not None else None,
        "preisart": "Festpreis",
        "zustand": zustand,
        "kategorie_hinweis": product.category,
        "bilder": [{"id": b.id, "url": medien.signierte_url(b.storage_key)} for b in bilder][:20],
        "einstellen_url": "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
        "grenzen": {"titel": TITEL_MAX, "text": TEXT_MAX},
    }


_ANZEIGE_ID = re.compile(r"/s-anzeige/[^/]+/(\d+)")


def kleinanzeigen_online(publication: ShopPublication, url: str | None) -> None:
    url = (url or "").strip() or None
    if url and not url.startswith("https://www.kleinanzeigen.de/"):
        raise KanalFehler("Bitte die Adresse der Anzeige von kleinanzeigen.de einfügen")
    treffer = _ANZEIGE_ID.search(url or "")
    publication.external_id = treffer.group(1) if treffer else (publication.external_id or "manuell")
    publication.payload_snapshot = {**(publication.payload_snapshot or {}), "url": url}
    publication.status = PublicationStatusEnum.PUBLISHED.value
    publication.published_at = utcnow()
    publication.error = None
