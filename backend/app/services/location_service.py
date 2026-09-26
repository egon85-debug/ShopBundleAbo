"""Lagerplatzverwaltung (Anforderung 29): Hierarchie + Auflösung gesprochener Angaben
("Halle zwei Regal B vier" → H2/B4)."""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LocationKind, StorageLocation

_NUMBER_WORDS = {
    "null": "0", "eins": "1", "ein": "1", "eine": "1", "zwei": "2", "drei": "3",
    "vier": "4", "fünf": "5", "sechs": "6", "sieben": "7", "acht": "8", "neun": "9",
    "zehn": "10", "elf": "11", "zwölf": "12",
}

_KIND_PREFIX = {
    LocationKind.SITE.value: "S",
    LocationKind.HALL.value: "H",
    LocationKind.AREA.value: "",
    LocationKind.SHELF.value: "",
    LocationKind.LEVEL.value: "E",
    LocationKind.BIN.value: "F",
}


def normalize_spoken(text: str) -> str:
    """"Halle zwei Regal B vier" → "halle 2 regal b4"."""
    words = re.split(r"\s+", text.lower().strip())
    words = [_NUMBER_WORDS.get(w, w) for w in words]
    text = " ".join(words)
    # "b 4" → "b4"
    text = re.sub(r"\b([a-z])\s+(\d+)\b", r"\1\2", text)
    return text


def resolve_spoken(db: Session, spoken: str) -> StorageLocation | None:
    """Löst eine gesprochene Angabe auf einen vorhandenen Lagerplatz auf.
    Nicht auflösbare Angaben erzeugen eine Rückfrage — es wird nichts geraten."""
    normalized = normalize_spoken(spoken)
    tokens: list[str] = []
    hall = re.search(r"halle\s*(\w+)", normalized)
    if hall:
        tokens.append(f"H{hall.group(1).upper()}")
    area = re.search(r"bereich\s*(\w+)", normalized)
    if area:
        tokens.append(area.group(1).upper())
    shelf = re.search(r"regal\s*(\w+)", normalized)
    if shelf:
        tokens.append(shelf.group(1).upper())
    level = re.search(r"ebene\s*(\w+)", normalized)
    if level:
        tokens.append(f"E{level.group(1).upper()}")
    bin_ = re.search(r"fach\s*(\w+)", normalized)
    if bin_:
        tokens.append(f"F{bin_.group(1).upper()}")
    if not tokens:
        return None

    # Tiefsten Lagerplatz suchen, dessen Code alle Tokens (in Reihenfolge) enthält.
    best: StorageLocation | None = None
    for location in db.scalars(select(StorageLocation)):
        code_parts = location.code.upper().split("/")
        idx = 0
        for token in tokens:
            while idx < len(code_parts) and code_parts[idx] != token:
                idx += 1
            if idx >= len(code_parts):
                break
            idx += 1
        else:
            if best is None or len(location.code) > len(best.code):
                best = location
    return best


def _kompakt(text: str) -> str:
    """"H2 / a-b4" → "H2AB4" – nur Buchstaben und Ziffern, groß."""
    return re.sub(r"[^0-9A-ZÄÖÜ]", "", text.upper())


def resolve_answer(db: Session, spoken: str) -> StorageLocation | None:
    """Einzeln gesprochener Lagerplatz aus der Sprachabfrage.

    Erst wie im freien Diktat ("Halle zwei Regal B vier"), dann der Code oder
    Name ohne Trennzeichen ("H2 A B4" → H2/A/B4). Mehrdeutig heißt: nichts.
    """
    location = resolve_spoken(db, spoken)
    if location:
        return location
    gesucht = _kompakt(normalize_spoken(spoken))
    if not gesucht:
        return None
    treffer = [loc for loc in db.scalars(select(StorageLocation))
               if gesucht in (_kompakt(loc.code), _kompakt(loc.name))]
    return treffer[0] if len(treffer) == 1 else None


def create_location(db: Session, *, parent_id: str | None, kind: str, name: str) -> StorageLocation:
    if kind not in [k.value for k in LocationKind]:
        raise ValueError(f"Unbekannte Lagerplatz-Ebene: {kind}")
    prefix = _KIND_PREFIX.get(kind, "")
    segment = f"{prefix}{name}".upper().replace(" ", "").replace("/", "-")
    if parent_id:
        parent = db.get(StorageLocation, parent_id)
        if parent is None:
            raise ValueError("Übergeordneter Lagerplatz existiert nicht")
        code = f"{parent.code}/{segment}"
    else:
        code = segment
    existing = db.scalar(select(StorageLocation).where(StorageLocation.code == code))
    if existing:
        return existing
    location = StorageLocation(parent_id=parent_id, kind=kind, name=name, code=code)
    db.add(location)
    db.flush()
    return location
