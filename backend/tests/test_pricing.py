"""Preisrecherche: Vergleichbarkeit, Ausreißer, Kennzahlen, Preisvorschlag."""
from decimal import Decimal

from sqlalchemy import select

from app.models import PriceQuote
from app.schemas.ai import PriceOffer
from app.services import pricing_service, product_service


def make_product(db, user, condition="new", sku="price-test-1"):
    product = product_service.create_draft(db, client_capture_id=sku, user=user)
    product.condition = condition
    db.commit()
    return product


class TestComparability:
    def test_pack_and_condition_excluded(self, db, employee):
        product = make_product(db, employee)
        offers = [
            PriceOffer(price=Decimal("59.90"), condition="new"),
            PriceOffer(price=Decimal("499.00"), condition="new", pack_size=10),
            PriceOffer(price=Decimal("35.00"), condition="used"),
            PriceOffer(price=Decimal("62.00"), condition="new", is_same_variant=False),
        ]
        run = pricing_service.evaluate_offers(db, product=product, offers=offers)
        db.commit()
        assert run.offer_count == 4
        assert run.comparable_count == 1
        excluded = db.scalars(select(PriceQuote).where(
            PriceQuote.is_comparable.is_(False))).all()
        reasons = {q.exclusion_reason for q in excluded}
        assert any("Gebinde" in r for r in reasons)
        assert any("Zustand" in r for r in reasons)
        assert any("Variante" in r for r in reasons)

    def test_used_product_compares_with_used_offers(self, db, employee):
        product = make_product(db, employee, condition="used", sku="price-test-2")
        offers = [PriceOffer(price=Decimal("35.00"), condition="used"),
                  PriceOffer(price=Decimal("59.90"), condition="new")]
        run = pricing_service.evaluate_offers(db, product=product, offers=offers)
        assert run.comparable_count == 1
        assert run.lowest_price == Decimal("35.00")


class TestOutliers:
    def test_iqr_outlier_marked(self, db, employee):
        product = make_product(db, employee, sku="price-test-3")
        prices = ["59.90", "61.00", "62.50", "63.00", "60.10", "9.99"]
        offers = [PriceOffer(price=Decimal(p), condition="new") for p in prices]
        run = pricing_service.evaluate_offers(db, product=product, offers=offers)
        db.commit()
        outliers = db.scalars(select(PriceQuote).where(
            PriceQuote.is_outlier.is_(True))).all()
        assert len(outliers) == 1
        assert outliers[0].price == Decimal("9.99")
        assert run.lowest_price == Decimal("59.90")


class TestStatsAndSuggestion:
    def test_stats(self, db, employee):
        product = make_product(db, employee, sku="price-test-4")
        offers = [PriceOffer(price=Decimal(p), condition="new")
                  for p in ("50.00", "60.00", "70.00")]
        run = pricing_service.evaluate_offers(db, product=product, offers=offers)
        assert run.average_price == Decimal("60.00")
        assert run.median_price == Decimal("60.00")
        assert product.lowest_market_price == Decimal("50.00")
        assert product.highest_market_price == Decimal("70.00")
        # Vorschlag: Median − 5 %
        assert product.recommended_sale_price == Decimal("57.00")

    def test_suggestion_respects_floor(self, db, employee):
        product = make_product(db, employee, sku="price-test-5")
        product.minimum_sale_price = Decimal("65.00")
        offers = [PriceOffer(price=Decimal(p), condition="new")
                  for p in ("50.00", "60.00", "70.00")]
        pricing_service.evaluate_offers(db, product=product, offers=offers)
        assert product.recommended_sale_price == Decimal("65.00")

    def test_no_comparable_offers(self, db, employee):
        product = make_product(db, employee, sku="price-test-6")
        offers = [PriceOffer(price=Decimal("499.00"), condition="new", pack_size=10)]
        run = pricing_service.evaluate_offers(db, product=product, offers=offers)
        assert run.comparable_count == 0
        assert run.lowest_price is None
        assert product.recommended_sale_price is None
