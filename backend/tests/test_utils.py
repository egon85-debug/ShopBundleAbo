"""Unit-Tests: EAN-Prüfziffer, Geldbeträge, Lagerplatz-Normalisierung."""
from decimal import Decimal

from app.services.location_service import normalize_spoken
from app.utils.ean import is_valid_gtin, normalize_gtin
from app.utils.money import parse_money


class TestEan:
    def test_valid_ean13(self):
        assert is_valid_gtin("4006381333931")
        assert is_valid_gtin("4059952529776")

    def test_invalid_check_digit(self):
        assert not is_valid_gtin("4006381333932")

    def test_valid_ean8_and_upc(self):
        assert is_valid_gtin("96385074")       # EAN-8
        assert is_valid_gtin("036000291452")   # UPC-A

    def test_normalization(self):
        assert normalize_gtin(" 4006381-333931 ") == "4006381333931"
        assert normalize_gtin("abc") is None
        assert normalize_gtin(None) is None

    def test_wrong_length(self):
        assert not is_valid_gtin("12345")
        assert not is_valid_gtin("123456789")


class TestMoney:
    def test_german_format(self):
        assert parse_money("28,50") == Decimal("28.50")
        assert parse_money("1.234,56") == Decimal("1234.56")

    def test_currency_suffix(self):
        assert parse_money("59,90 €") == Decimal("59.90")

    def test_float_input_is_exact(self):
        assert parse_money(28.5) == Decimal("28.50")

    def test_negative_rejected(self):
        assert parse_money("-5") is None

    def test_invalid(self):
        assert parse_money("viel") is None
        assert parse_money(None) is None

    def test_always_two_places(self):
        assert str(parse_money("59")) == "59.00"


class TestSpokenLocation:
    def test_number_words(self):
        assert normalize_spoken("Halle zwei Regal B vier") == "halle 2 regal b4"

    def test_letter_digit_join(self):
        assert normalize_spoken("Regal b 4") == "regal b4"
