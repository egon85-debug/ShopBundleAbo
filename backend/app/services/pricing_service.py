"""Preisrecherche-Auswertung (Anforderung 6/27):
- nur tatsächlich vergleichbare Angebote (gleiche Variante, kein Gebinde, passender Zustand)
- Ausreißer-Erkennung (IQR-Regel)
- Kennzahlen + Preis-Historie + Verkaufspreis-Vorschlag (Benutzer entscheidet endgültig)."""
from decimal import Decimal, ROUND_HALF_UP
from statistics import median

from sqlalchemy.orm import Session

from app.models import PriceQuote, PriceResearchRun, Product
from app.models.base import utcnow
from app.schemas.ai import PriceOffer

TWO = Decimal("0.01")


def _comparable(offer: PriceOffer, product_condition: str) -> tuple[bool, str | None]:
    if not offer.is_same_variant:
        return False, "Andere Variante/anderes Modell"
    if offer.pack_size and offer.pack_size > 1:
        return False, f"Gebinde ({offer.pack_size}er-Pack) nicht mit Einzelartikel vergleichbar"
    if offer.condition != "unknown" and product_condition not in ("unknown", ""):
        product_is_new = product_condition in ("new", "new_opened")
        offer_is_new = offer.condition == "new"
        if product_is_new != offer_is_new:
            return False, f"Zustand nicht vergleichbar ({offer.condition} vs. {product_condition})"
    return True, None


def _outlier_bounds(prices: list[Decimal]) -> tuple[Decimal, Decimal]:
    """IQR-Regel: [Q1 − 1.5·IQR, Q3 + 1.5·IQR]."""
    ordered = sorted(prices)
    n = len(ordered)
    q1 = ordered[n // 4]
    q3 = ordered[(3 * n) // 4] if (3 * n) // 4 < n else ordered[-1]
    iqr = q3 - q1
    return q1 - iqr * Decimal("1.5"), q3 + iqr * Decimal("1.5")


def evaluate_offers(
    db: Session, *, product: Product, offers: list[PriceOffer]
) -> PriceResearchRun:
    """Wertet die Angebote aus, persistiert Quotes + Historie und aktualisiert das Produkt."""
    run = PriceResearchRun(product_id=product.id, offer_count=len(offers))
    db.add(run)
    db.flush()

    comparable_prices: list[Decimal] = []
    quotes: list[PriceQuote] = []
    for offer in offers:
        ok, reason = _comparable(offer, product.condition)
        quote = PriceQuote(
            product_id=product.id,
            research_run_id=run.id,
            source_name=offer.source_name,
            title=offer.title,
            url=offer.url,
            price=offer.price,
            shipping_cost=offer.shipping_cost,
            condition=offer.condition,
            is_comparable=ok,
            exclusion_reason=reason,
        )
        quotes.append(quote)
        db.add(quote)
        if ok:
            comparable_prices.append(offer.price)

    # Ausreißer nur unter den vergleichbaren Angeboten markieren.
    if len(comparable_prices) >= 4:
        low, high = _outlier_bounds(comparable_prices)
        comparable_prices = []
        for quote in quotes:
            if quote.is_comparable and not (low <= quote.price <= high):
                quote.is_outlier = True
            elif quote.is_comparable:
                comparable_prices.append(quote.price)

    if comparable_prices:
        run.lowest_price = min(comparable_prices)
        run.highest_price = max(comparable_prices)
        run.average_price = (sum(comparable_prices) / len(comparable_prices)).quantize(
            TWO, rounding=ROUND_HALF_UP)
        run.median_price = Decimal(median(comparable_prices)).quantize(TWO, rounding=ROUND_HALF_UP)
    run.comparable_count = len(comparable_prices)

    product.lowest_market_price = run.lowest_price
    product.highest_market_price = run.highest_price
    product.average_market_price = run.average_price
    product.median_market_price = run.median_price
    product.price_research_date = utcnow()

    suggestion = suggest_sale_price(product, run)
    if suggestion is not None:
        product.recommended_sale_price = suggestion
    return run


def suggest_sale_price(product: Product, run: PriceResearchRun) -> Decimal | None:
    """Vorschlag: Median − 5 %, begrenzt durch Mindestpreis und Einkaufspreis.
    Der Benutzer entscheidet immer über den endgültigen Verkaufspreis."""
    if run.median_price is None:
        return None
    suggestion = (run.median_price * Decimal("0.95")).quantize(TWO, rounding=ROUND_HALF_UP)
    if product.minimum_sale_price is not None:
        suggestion = max(suggestion, product.minimum_sale_price)
    if product.purchase_price_net is not None:
        suggestion = max(suggestion, product.purchase_price_net.quantize(TWO))
    return suggestion
