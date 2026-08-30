"""GTIN-/EAN-/UPC-Validierung mit Prüfziffer (GTIN-8/12/13/14)."""
import re

_GTIN_RE = re.compile(r"^\d{8}$|^\d{12,14}$")


def normalize_gtin(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"[\s\-]", "", value)
    return digits if digits.isdigit() else None


def is_valid_gtin(value: str | None) -> bool:
    digits = normalize_gtin(value)
    if not digits or not _GTIN_RE.match(digits):
        return False
    # Prüfziffer: von rechts (ohne Prüfziffer) abwechselnd mit 3 und 1 gewichten.
    total = 0
    for i, ch in enumerate(reversed(digits[:-1])):
        weight = 3 if i % 2 == 0 else 1
        total += int(ch) * weight
    check = (10 - total % 10) % 10
    return check == int(digits[-1])
