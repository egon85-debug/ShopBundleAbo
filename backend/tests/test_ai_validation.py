"""KI-Validierung (Anforderung 26/38.4): Schemas verwerfen ungültige KI-Ausgaben,
Merge respektiert Provenienz (user > research > ai) und EAN-Prüfziffern."""
import pytest
from pydantic import ValidationError

from app.models import Product
from app.schemas.ai import VisionAnalysis, VoiceExtraction
from app.services import merge_service, product_service


class TestSchemas:
    def test_money_strings_are_parsed_exactly(self):
        extraction = VoiceExtraction.model_validate(
            {"purchase_price_net": "28,50", "sale_price": "59.00"})
        assert str(extraction.purchase_price_net) == "28.50"

    def test_invalid_money_rejected(self):
        with pytest.raises(ValidationError):
            VoiceExtraction.model_validate({"purchase_price_net": "viel Geld"})

    def test_negative_stock_rejected(self):
        with pytest.raises(ValidationError):
            VoiceExtraction.model_validate({"stock": -3})

    def test_confidence_is_clamped(self):
        analysis = VisionAnalysis.model_validate(
            {"ean": "4059952529776", "confidence": {"ean": 1.7, "x": "kaputt"}})
        assert analysis.confidence["ean"] == 1.0
        assert "x" not in analysis.confidence

    def test_unknown_fields_ignored(self):
        analysis = VisionAnalysis.model_validate({"halluzination": "ja"})
        assert analysis.product_name is None


class TestMergePrecedence:
    def test_user_value_survives_ai_merge(self, db, employee):
        product = product_service.create_draft(db, client_capture_id="merge-1",
                                               user=employee)
        product_service.apply_user_update(db, product=product,
                                          changes={"manufacturer": "Makita"},
                                          user=employee)
        merge_service.merge_vision(product, VisionAnalysis(
            manufacturer="Bosch", confidence={"manufacturer": 0.99}))
        assert product.manufacturer == "Makita"
        assert product.field_sources["manufacturer"] == "user"

    def test_invalid_ean_from_vision_not_merged(self, db, employee):
        product = product_service.create_draft(db, client_capture_id="merge-2",
                                               user=employee)
        conflicts = merge_service.merge_vision(product, VisionAnalysis(
            ean="4006381333932", confidence={"ean": 0.99}))  # falsche Prüfziffer
        assert product.ean is None
        assert any("Prüfziffer" in c for c in conflicts)

    def test_ean_conflict_between_photo_and_research(self, db, employee):
        from app.schemas.ai import ResearchCandidate
        product = product_service.create_draft(db, client_capture_id="merge-3",
                                               user=employee)
        product_service.apply_user_update(db, product=product,
                                          changes={"ean": "4059952529776"},
                                          user=employee)
        conflicts = merge_service.merge_research(product, ResearchCandidate(
            ean="4006381333931", match_score=0.9))
        assert product.ean == "4059952529776"  # Benutzerwert bleibt
        assert any("Welche ist korrekt" in c for c in conflicts)

    def test_low_confidence_fields_reported(self, db, employee):
        product = product_service.create_draft(db, client_capture_id="merge-4",
                                               user=employee)
        merge_service.merge_vision(product, VisionAnalysis(
            color="Anthrazit", manufacturer="Bosch",
            confidence={"manufacturer": 0.97}))
        product.field_confidence = {**product.field_confidence, "category": 0.4}
        low = merge_service.low_confidence_fields(product)
        assert "category" in low
        assert "manufacturer" not in low


class TestQuestions:
    def test_netto_brutto_question_on_low_confidence(self, db, employee):
        from decimal import Decimal
        from app.services import questions_service
        product = product_service.create_draft(db, client_capture_id="q-1",
                                               user=employee)
        product.purchase_price_net = Decimal("28.50")
        product.field_confidence = {"purchase_price_net": 0.55}
        product.stock_quantity = 5
        questions = questions_service.build_questions(product, [])
        assert any("netto oder brutto" in q["text"] for q in questions)

    def test_candidate_selection_question(self, db, employee):
        from app.services import questions_service
        product = product_service.create_draft(db, client_capture_id="q-2",
                                               user=employee)
        product.stock_quantity = 5
        product.research_candidates = [
            {"product_name": "A", "ean": "1"}, {"product_name": "B", "ean": "2"}]
        questions = questions_service.build_questions(product, [])
        select_q = next(q for q in questions if q["kind"] == "candidate_select")
        assert len(select_q["options"]) == 2
