"""Lieferanten: Fuzzy-Zuordnung gesprochener Namen zu bestehenden Lieferanten
(Anforderung 28)."""
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Supplier

MATCH_THRESHOLD = 0.82


def _normalize(name: str) -> str:
    return " ".join(name.lower().replace("-", " ").split())


def find_match(db: Session, spoken_name: str) -> Supplier | None:
    normalized = _normalize(spoken_name)
    exact = db.scalar(select(Supplier).where(Supplier.name.ilike(spoken_name.strip())))
    if exact:
        return exact
    best: tuple[float, Supplier | None] = (0.0, None)
    for supplier in db.scalars(select(Supplier)):
        ratio = SequenceMatcher(None, normalized, _normalize(supplier.name)).ratio()
        if ratio > best[0]:
            best = (ratio, supplier)
    return best[1] if best[0] >= MATCH_THRESHOLD else None


def match_or_create(db: Session, spoken_name: str) -> Supplier:
    match = find_match(db, spoken_name)
    if match:
        return match
    supplier = Supplier(name=spoken_name.strip())
    db.add(supplier)
    db.flush()
    return supplier
