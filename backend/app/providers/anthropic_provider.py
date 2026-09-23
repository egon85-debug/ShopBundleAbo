"""Vision-, Extraktions- und Shoptext-Provider auf Basis der Anthropic Messages API
(offizielles Python-SDK). API-Key ausschließlich aus Server-Env; strukturierte
JSON-Ausgaben werden gegen die Pydantic-Schemas validiert, bevor sie
weiterverwendet werden."""
import base64
import io
import json

import anthropic
from PIL import Image, ImageOps

from app.config import get_settings
from app.providers.base import (
    LlmExtractor,
    ProviderNotConfigured,
    ProviderRejected,
    VisionProvider,
)
from app.schemas.ai import ShopTextGeneration, VisionAnalysis, VoiceExtraction

# Laengste Bildkante, die die aktuellen Modelle ungekuerzt auswerten. Groesser
# bringt nichts, kleiner kostet Lesbarkeit bei kleiner Etikettenschrift.
MAX_BILDKANTE = 2576

# Ablehnungen des Modells auf ein anderes Modell umleiten, serverseitig in
# derselben Anfrage. Nur fuer die Modelle, die das anbieten.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MODELLE_MIT_FALLBACK = {"claude-opus-5", "claude-opus-5-5", "claude-fable-5-1"}

VISION_PROMPT = """Du analysierst ein Foto eines Lagerartikels für ein Warenwirtschaftssystem.
Extrahiere ausschließlich, was du zuverlässig auf dem Bild erkennen kannst (inkl. OCR von
Etiketten, Verpackungen, Typenschildern und Barcodes). ERFINDE NICHTS: Was nicht sicher
erkennbar ist, ist null. Antworte NUR mit einem JSON-Objekt nach diesem Schema:
{"manufacturer": str|null, "brand": str|null, "product_name": str|null, "model": str|null,
"model_number": str|null, "mpn": str|null, "ean": str|null, "upc": str|null,
"category": str|null, "subcategory": str|null, "color": str|null, "size": str|null,
"variant": str|null, "technical_data": {str: str}, "packaging_info": str|null,
"visible_condition": str|null, "ocr_texts": [str], "other_features": [str],
"confidence": {feldname: 0.0-1.0 für jedes gesetzte Feld}}"""

VOICE_PROMPT = """Du extrahierst strukturierte Lagerdaten aus dem frei gesprochenen Transkript
eines Lagermitarbeiters (deutsch). Zahlwörter in Zahlen umwandeln ("vierzehn" -> 14,
"Halle zwei Regal B vier" -> "Halle 2 Regal B4"). Preise als String mit Punkt ("28.50").
ERFINDE NICHTS: Nicht Gesagtes ist null. Wenn unklar ist, ob ein Preis netto oder brutto
ist, setze ihn in purchase_price_net und gib dafür eine confidence <= 0.6.
Antworte NUR mit einem JSON-Objekt nach diesem Schema:
{"stock": int|null, "purchase_price_net": str|null, "purchase_price_gross": str|null,
"sale_price": str|null, "minimum_sale_price": str|null, "supplier_name": str|null,
"purchase_date": "YYYY-MM-DD"|null, "invoice_number": str|null,
"storage_location_spoken": str|null,
"condition": "new"|"new_opened"|"refurbished"|"used"|"defective"|null,
"packaging_condition": str|null, "damaged_count": int|null, "batch_number": str|null,
"serial_number": str|null, "internal_article_number": str|null, "notes": str|null,
"origin": str|null, "confidence": {feldname: 0.0-1.0}}

Transkript:
"""

SHOPTEXT_PROMPT = """Du schreibst ein professionelles, sachliches, verkaufsorientiertes
Shop-Angebot auf Deutsch. Verwende AUSSCHLIESSLICH die übergebenen verifizierten Daten.
Die "unverifizierten" Angaben darfst du NICHT als Fakten formulieren — höchstens neutral
("laut Herstellerangabe" ist NICHT erlaubt, lasse sie im Zweifel weg). Erfinde keine
technischen Eigenschaften. Zustand und Hinweise ehrlich benennen.
Antworte NUR mit einem JSON-Objekt:
{"seo_title": str (max 70 Zeichen), "short_description": str (2-3 Sätze),
"long_description": str (HTML mit <p>/<ul>), "bullet_points": [str, max 6],
"scope_of_delivery": str|null, "condition_note": str|null, "meta_title": str (max 60),
"meta_description": str (max 155), "url_slug": str (kleinbuchstaben-mit-bindestrichen),
"tags": [str, max 10], "category": str|null}"""


class AnthropicClient:
    def __init__(self) -> None:
        s = get_settings()
        if not s.anthropic_api_key:
            raise ProviderNotConfigured("ANTHROPIC_API_KEY ist nicht gesetzt")
        self.model = s.anthropic_model
        # Voruebergehende Fehler (429, 5xx, Verbindung) wiederholt das SDK selbst;
        # was dann noch scheitert, wiederholt die Job-Queue.
        self._client = anthropic.Anthropic(api_key=s.anthropic_api_key,
                                           timeout=180.0, max_retries=2)

    def complete(self, content: list[dict], max_tokens: int = 16000) -> str:
        # max_tokens grosszuegig: die Modelle denken vor der Antwort, und das
        # zaehlt mit. Zu knapp bemessen, bricht das JSON mittendrin ab.
        request = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        try:
            if self.model in MODELLE_MIT_FALLBACK:
                response = self._client.beta.messages.create(
                    betas=[FALLBACK_BETA], fallbacks="default", **request)
            else:
                response = self._client.messages.create(**request)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise ProviderRejected(
                "ANTHROPIC_API_KEY ist ungueltig oder hat keine Berechtigung") from exc
        except anthropic.NotFoundError as exc:
            raise ProviderRejected(
                f"Modell {self.model!r} ist unbekannt (ANTHROPIC_MODEL pruefen)") from exc
        except anthropic.BadRequestError as exc:
            raise ProviderRejected(f"Anfrage abgelehnt: {exc.message}") from exc

        if response.stop_reason == "refusal":
            raise ProviderRejected("Das Modell hat die Anfrage abgelehnt")
        if response.stop_reason == "max_tokens":
            raise ProviderRejected("Antwort abgeschnitten (max_tokens erreicht)")
        return "".join(block.text for block in response.content if block.type == "text")


def bild_fuer_erkennung(image_bytes: bytes) -> tuple[bytes, str]:
    """Handyfoto fuer die Erkennung aufbereiten.

    Kameras speichern in voller Aufloesung, oft 5–10 MB — die API nimmt
    hoechstens 5 MB pro Bild an. Ausserdem liegt die Drehung bei Handyfotos
    meist nur als EXIF-Angabe vor; ungedreht liest sich ein Etikett schlecht.
    Das Original bleibt davon unberuehrt, verkleinert wird nur die Kopie, die
    zur Erkennung geht.
    """
    with Image.open(io.BytesIO(image_bytes)) as original:
        bild = ImageOps.exif_transpose(original).convert("RGB")
    bild.thumbnail((MAX_BILDKANTE, MAX_BILDKANTE), Image.LANCZOS)
    puffer = io.BytesIO()
    bild.save(puffer, format="JPEG", quality=85, optimize=True)
    return puffer.getvalue(), "image/jpeg"


def _parse_json_block(text: str) -> dict:
    """Extrahiert das JSON-Objekt aus der Modellantwort (auch bei ```-Fences)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Keine JSON-Ausgabe im Modellergebnis")
    return json.loads(text[start : end + 1])


class AnthropicVisionProvider(VisionProvider):
    name = "anthropic-vision"

    def analyze_product_image(self, image_bytes: bytes, content_type: str) -> VisionAnalysis:
        client = AnthropicClient()
        daten, media_type = bild_fuer_erkennung(image_bytes)
        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(daten).decode(),
                },
            },
            {"type": "text", "text": VISION_PROMPT},
        ]
        raw = client.complete(content)
        return VisionAnalysis.model_validate(_parse_json_block(raw))


class AnthropicLlmExtractor(LlmExtractor):
    name = "anthropic-llm"

    def extract_voice_data(self, transcript: str) -> VoiceExtraction:
        client = AnthropicClient()
        raw = client.complete([{"type": "text", "text": VOICE_PROMPT + transcript}])
        return VoiceExtraction.model_validate(_parse_json_block(raw))

    def generate_shop_text(self, verified_fields: dict, unverified_fields: dict) -> ShopTextGeneration:
        client = AnthropicClient()
        payload = json.dumps(
            {"verifiziert": verified_fields, "unverifiziert": unverified_fields},
            ensure_ascii=False,
            default=str,
        )
        raw = client.complete(
            [{"type": "text", "text": SHOPTEXT_PROMPT + "\n\nProduktdaten:\n" + payload}],
        )
        return ShopTextGeneration.model_validate(_parse_json_block(raw))
