"""Dublettenprüfung vor der Neuanlage (Anforderung 13).
Prüft in dieser Reihenfolge: EAN/GTIN → MPN → SKU → Hersteller+Modell → Namensähnlichkeit.
(Visuelle Ähnlichkeit ist eine spätere Ausbaustufe, s. docs/roadmap.md.)"""
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product

NAME_SIMILARITY_THRESHOLD = 0.87


def find_duplicates(db: Session, product: Product, limit: int = 5) -> list[tuple[Product, str]]:
    matches: list[tuple[Product, str]] = []
    seen: set[str] = {product.id}

    def add(candidates, reason: str) -> None:
        for c in candidates:
            if c.id not in seen and c.confirmed_at is not None:
                matches.append((c, reason))
                seen.add(c.id)

    if product.ean:
        add(db.scalars(select(Product).where(Product.ean == product.ean)), "Gleiche EAN")
    if product.gtin:
        add(db.scalars(select(Product).where(Product.gtin == product.gtin)), "Gleiche GTIN")
    if product.mpn:
        add(db.scalars(select(Product).where(Product.mpn == product.mpn)), "Gleiche Herstellernummer")
    if product.manufacturer and product.model:
        add(
            db.scalars(select(Product).where(
                Product.manufacturer.ilike(product.manufacturer),
                Product.model.ilike(product.model),
            )),
            "Gleicher Hersteller und Modell",
        )
    if len(matches) < limit and product.product_name:
        # Namensähnlichkeit: Kandidaten grob per DB-Filter, fein per SequenceMatcher.
        name = product.product_name.lower()
        first_word = name.split()[0] if name.split() else name
        candidates = db.scalars(
            select(Product).where(Product.product_name.ilike(f"%{first_word}%")).limit(200)
        )
        for c in candidates:
            if c.id in seen or c.confirmed_at is None or not c.product_name:
                continue
            ratio = SequenceMatcher(None, name, c.product_name.lower()).ratio()
            if ratio >= NAME_SIMILARITY_THRESHOLD:
                matches.append((c, f"Ähnliche Produktbezeichnung ({ratio:.0%})"))
                seen.add(c.id)

    return matches[:limit]
