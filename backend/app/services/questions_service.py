"""Intelligente Rückfragen (Anforderung 9): so wenige wie möglich, gebündelt im
Kontrollbildschirm. Jede Frage hat eine ID, ein Zielfeld und optional Auswahloptionen."""
import uuid

from app.models import Product


def _question(text: str, field: str | None = None, options: list | None = None,
              kind: str = "text") -> dict:
    return {
        "id": uuid.uuid4().hex[:8],
        "text": text,
        "field": field,
        "kind": kind,  # text | number | choice | candidate_select
        "options": options or [],
    }


def build_questions(product: Product, conflicts: list[str]) -> list[dict]:
    questions: list[dict] = []

    # 1. Konflikte zuerst (z. B. Foto-EAN ≠ Recherche-EAN)
    for conflict in conflicts:
        field = "ean" if "EAN" in conflict else None
        questions.append(_question(conflict, field=field))

    # 2. Mehrdeutige Produktkandidaten
    if product.research_candidates and len(product.research_candidates) > 1:
        questions.append(_question(
            "Wir haben mehrere mögliche Artikel gefunden. Bitte den passenden auswählen.",
            kind="candidate_select",
            options=[
                {
                    "index": i,
                    "product_name": c.get("product_name"),
                    "manufacturer": c.get("manufacturer"),
                    "ean": c.get("ean"),
                    "image_url": c.get("image_url"),
                }
                for i, c in enumerate(product.research_candidates)
            ],
        ))

    # 3. Kein Artikelname — etwa weil die Bilderkennung nicht eingerichtet ist
    #    oder auf dem Foto nichts Lesbares fand. Ohne Namen gibt es keinen Shop.
    if not product.product_name:
        questions.append(_question(
            "Ich konnte den Artikel nicht erkennen. Wie heißt er?",
            field="product_name",
        ))

    # 4. Fehlender Bestand
    if not product.stock_quantity:
        questions.append(_question(
            "Ich habe keinen Bestand erkannt. Wie viele Stück sind vorhanden?",
            field="stock_quantity", kind="number",
        ))

    # 5. Netto/Brutto unklar (niedrige Confidence auf dem EK-Preis)
    conf = product.field_confidence or {}
    if product.purchase_price_net is not None and conf.get("purchase_price_net", 1.0) <= 0.6:
        questions.append(_question(
            f"Der erkannte Einkaufspreis ist {product.purchase_price_net} €. "
            "Ist das netto oder brutto?",
            field="purchase_price_net", kind="choice",
            options=["netto", "brutto"],
        ))

    return questions
