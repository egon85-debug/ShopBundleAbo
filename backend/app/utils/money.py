"""Geldbeträge: immer Decimal mit 2 Nachkommastellen, niemals Float."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")


def parse_money(value) -> Decimal | None:
    """Robustes Parsen aus KI-/Spracheingaben: '28,50', '28.50 €', 28.5, Decimal."""
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    if isinstance(value, int):
        return Decimal(value).quantize(TWO_PLACES)
    if isinstance(value, float):
        # Float nur über str-Umweg, um Binärrauschen zu vermeiden.
        value = repr(value)
    text = str(value).strip().replace("€", "").replace("EUR", "").strip()
    # Deutsche Schreibweise: 1.234,56 → 1234.56
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    if amount < 0:
        return None
    return amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def money_str(value: Decimal | None) -> str | None:
    return None if value is None else str(value.quantize(TWO_PLACES))
