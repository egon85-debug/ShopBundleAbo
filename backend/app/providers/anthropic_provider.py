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
    ProductResearchProvider,
    ProviderNotConfigured,
    ProviderRejected,
    VisionImage,
    VisionProvider,
)
from app.services import ki_verbrauch
from app.schemas.ai import (
    PriceOffer,
    ResearchCandidate,
    ShopTextGeneration,
    VisionAnalysis,
    VoiceExtraction,
)

# Laengste Bildkante, die die aktuellen Modelle ungekuerzt auswerten. Groesser
# bringt nichts, kleiner kostet Lesbarkeit bei kleiner Etikettenschrift.
MAX_BILDKANTE = 2576

# Ablehnungen des Modells auf ein anderes Modell umleiten, serverseitig in
# derselben Anfrage. Nur fuer die Modelle, die das anbieten.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MODELLE_MIT_FALLBACK = {"claude-opus-5", "claude-opus-5-5", "claude-fable-5-1"}

# Hoechstens so viele Fotos je Erkennung; wichtigste Ansichten zuerst.
MAX_BILDER = 6
ROLLEN = {
    "front": "Vorderseite", "back": "Rückseite", "packaging": "Verpackung",
    "barcode": "Barcode/EAN", "type_plate": "Typenschild", "serial_number": "Seriennummer",
    "accessories": "Zubehör", "damage": "Beschädigung",
}

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

SHOPTEXT_PROMPT = """Du schreibst den Verkaufstext für einen Online-Shop, auf Deutsch, sachlich
und verkaufsorientiert. Leser sind Kunden – nicht das Lagerteam.

Daten:
- Verwende AUSSCHLIESSLICH die Angaben unter "verifiziert".
- Angaben unter "unverifiziert" lässt du vollständig weg. Erwähne nie, dass etwas
  unbestätigt, ungeprüft, unklar oder nur teilweise bekannt ist.
- Erfinde nichts: keine Eigenschaften, Mengen, Zutaten, Maße oder Versprechen.
  Was fehlt, fehlt – ohne Hinweis darauf.

Niemals im Text:
- wie der Artikel erfasst oder geprüft wurde (Fotos, Etiketten, Aufdruck, Sichtprüfung,
  Recherche, Quellen, "laut …", "(Aufdruck)")
- Vorbehalte und Unsicherheiten ("möglicherweise", "können … versehen sein",
  "nicht bestätigt", "wurde nicht geprüft")
- interne Einordnungen wie die Shop-Kategorie ("Kategorie: …") oder bloße
  Wiederholungen des Namens als Stichpunkt

Zustand:
- Ist der Artikel nicht neu, beschreibe den Zustand kurz und konkret in
  "condition_note" (z. B. "Leichte Gebrauchsspuren am Gehäuse"), als Tatsache.
  Bei neuen Artikeln condition_note = null.

Aufbau:
- long_description: HTML nur mit <p>, <ul>, <li>, <strong>. Erst 1–2 Absätze, was der
  Artikel ist und wofür er gut ist; dann eine Liste der wichtigsten Eigenschaften
  (Füllmenge, Maße, Leistung, Material …), soweit verifiziert.
- Lebensmittel und Getränke: Füllmenge je Einheit und Anzahl, Nährwerte als Liste,
  Zutaten und Allergene – nur wenn verifiziert vorhanden, sonst weglassen.
- bullet_points: bis zu 6 kurze Kaufargumente mit echtem Inhalt.

Antworte NUR mit einem JSON-Objekt:
{"seo_title": str (max 70 Zeichen), "short_description": str (2-3 Sätze),
"long_description": str (HTML), "bullet_points": [str, max 6],
"scope_of_delivery": str|null, "condition_note": str|null, "meta_title": str (max 60),
"meta_description": str (max 155), "url_slug": str (kleinbuchstaben-mit-bindestrichen),
"tags": [str, max 10], "category": str|null}"""


VISION_MEHRERE_PROMPT = """Die Fotos oben zeigen alle DENSELBEN Artikel aus verschiedenen
Ansichten (die Beschriftung vor jedem Bild nennt die Ansicht). Führe die Angaben aus allen
Bildern zusammen: Typenschild und Barcode sind für Modell, Herstellernummer und EAN
maßgeblich, die Vorderseite für Produktname und Marke. Widersprechen sich zwei Bilder, nimm
die besser lesbare Angabe und senke die confidence.
"""

# Websuche/Abruf in der Version mit dynamischer Filterung — fuer die aktuellen
# Modelle. Aeltere Modelle (Haiku 4.5 u. a.) kennen nur die Grundversion.
WEBSUCHE_NEU = ("web_search_20260209", "web_fetch_20260209")
WEBSUCHE_ALT = ("web_search_20250305", "web_fetch_20250910")
MODELLE_NUR_ALTE_WEBSUCHE = ("claude-haiku", "claude-sonnet-4-5", "claude-opus-4-5",
                             "claude-opus-4-1", "claude-sonnet-4-")
# Ohne Einstellung der Denktiefe (effort) – eine Angabe lehnt die API ab.
# Diese Modelle denken ohne thinking-Angabe gar nicht vorab.
MODELLE_OHNE_EFFORT = ("claude-haiku", "claude-sonnet-4-5", "claude-opus-4-1",
                       "claude-sonnet-4-0", "claude-opus-4-0", "claude-3")

RECHERCHE_REGELN = """
Regeln:
- Nutze die Websuche. Suche zuerst nach der EAN (liefert exakte Treffer), sonst nach
  Hersteller + Modell/Herstellernummer. Bevorzuge Herstellerseiten und große deutsche
  Händler/Vergleichsportale.
- Übernimm NUR Angaben, die auf einer gefundenen Seite stehen. Nichts erfinden, nichts
  schätzen, keine Angaben aus dem Gedächtnis. Unbekanntes ist null.
- Die Angaben vom Foto können Lesefehler enthalten; verlasse dich auf die Quellen.
- Schreibe Beschreibungen in eigenen Worten (nicht wörtlich abschreiben), sachlich, Deutsch.
- Antworte am Ende AUSSCHLIESSLICH mit dem JSON-Objekt, ohne Text davor oder danach.
"""

IDENTIFY_PROMPT = """Recherchiere im Internet die Produktdaten eines Lagerartikels.

Bekannt (vom Foto erkannt oder eingegeben):
{bekannt}
""" + RECHERCHE_REGELN + """
match_score (0.0-1.0) = wie sicher die Quelle GENAU diesen Artikel beschreibt:
0.95+ nur wenn EAN oder Herstellernummer auf der Quelle exakt übereinstimmen,
0.7-0.9 wenn Hersteller und Modell eindeutig übereinstimmen, darunter bei Zweifel.
Kommen mehrere Varianten in Frage (Farbe, Größe, Set-Umfang), liefere bis zu 3 Kandidaten,
den wahrscheinlichsten zuerst. technical_data: die bis zu 12 wichtigsten Angaben mit
Einheit ("Spannung": "12 V"). description: 2-4 Sätze.

JSON-Format:
{{"candidates": [{{"product_name": str|null, "manufacturer": str|null, "brand": str|null,
"ean": str|null, "mpn": str|null, "category": str|null, "description": str|null,
"technical_data": {{str: str}}, "attributes": {{str: str}}, "source_url": str|null,
"match_score": float}}]}}
Nichts gefunden: {{"candidates": []}}"""

OFFERS_PROMPT = """Recherchiere aktuelle Angebote für diesen Artikel in Deutschland,
um einen Verkaufspreis festzulegen.

Artikel:
{bekannt}
Zustand des eigenen Artikels: {zustand}
""" + RECHERCHE_REGELN + """
Suche bei Preisvergleichen (z. B. idealo, geizhals), großen Händlern, Marktplätzen und
Fachhändlern. Liefere bis zu 10 Angebote, die du mit Preis tatsächlich gesehen hast.
Preise in Euro, wie angezeigt (inkl. MwSt.), als String mit Punkt ("59.90").
is_same_variant = false, wenn Modell, Variante oder Lieferumfang abweichen.
pack_size = Stückzahl, wenn es ein Mehrfachpack ist, sonst null.
condition: "new" | "used" | "refurbished" | "unknown".

JSON-Format:
{{"offers": [{{"title": str|null, "price": str, "shipping_cost": str|null,
"condition": str, "url": str|null, "source_name": str|null,
"is_same_variant": bool, "pack_size": int|null}}]}}
Nichts gefunden: {{"offers": []}}"""


def _modell(schritt: str) -> str | None:
    """Eigenes Modell für einen Schritt (Settings.ki_modell_*), sonst das Hauptmodell."""
    return getattr(get_settings(), schritt, None) or None


class AnthropicClient:
    def __init__(self, model: str | None = None) -> None:
        s = get_settings()
        if not s.anthropic_api_key:
            raise ProviderNotConfigured("ANTHROPIC_API_KEY ist nicht gesetzt")
        self.model = model or s.anthropic_model
        # Voruebergehende Fehler (429, 5xx, Verbindung) wiederholt das SDK selbst;
        # was dann noch scheitert, wiederholt die Job-Queue.
        self._client = anthropic.Anthropic(api_key=s.anthropic_api_key,
                                           timeout=180.0, max_retries=2)

    def complete(self, content: list[dict], max_tokens: int = 16000,
                 tools: list[dict] | None = None, max_fortsetzungen: int = 4,
                 effort: str | None = None) -> str:
        """Eine Anfrage; mit Server-Werkzeugen (Websuche) auch mehrere Runden.

        Die Websuche laeuft bei Anthropic. Braucht sie mehr Runden als die
        Serverschleife in einem Zug erlaubt, endet die Antwort mit
        pause_turn — dann wird dieselbe Unterhaltung erneut geschickt und der
        Server macht weiter.
        """
        # max_tokens grosszuegig: die Modelle denken vor der Antwort, und das
        # zaehlt mit. Zu knapp bemessen, bricht das JSON mittendrin ab.
        messages: list[dict] = [{"role": "user", "content": content}]
        for _ in range(max_fortsetzungen + 1):
            response = self._senden(messages, max_tokens, tools, effort)
            # Jede Runde kostet – auch eine, deren Ergebnis danach verworfen wird.
            ki_verbrauch.erfassen(response, self.model)
            if response.stop_reason != "pause_turn":
                break
            messages = [{"role": "user", "content": content},
                        {"role": "assistant", "content": response.content}]
        else:
            raise ProviderRejected("Recherche nicht fertig geworden (zu viele Runden)")

        if response.stop_reason == "refusal":
            raise ProviderRejected("Das Modell hat die Anfrage abgelehnt")
        if response.stop_reason == "max_tokens":
            raise ProviderRejected("Antwort abgeschnitten (max_tokens erreicht)")
        return schlusstext(response.content)

    def _senden(self, messages: list[dict], max_tokens: int, tools: list[dict] | None,
                effort: str | None = None):
        request = {"model": self.model, "max_tokens": max_tokens, "messages": messages}
        if tools:
            request["tools"] = tools
        # Denktiefe: ohne Angabe denken die aktuellen Modelle auf „high“, und das
        # Nachdenken zählt als (teure) Ausgabe. Siehe Settings.ki_effort.
        effort = effort or getattr(get_settings(), "ki_effort", None)
        if effort and not self.model.startswith(MODELLE_OHNE_EFFORT):
            request["output_config"] = {"effort": effort}
        try:
            if self.model in MODELLE_MIT_FALLBACK:
                return self._client.beta.messages.create(
                    betas=[FALLBACK_BETA], fallbacks="default", **request)
            return self._client.messages.create(**request)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise ProviderRejected(
                "ANTHROPIC_API_KEY ist ungueltig oder hat keine Berechtigung") from exc
        except anthropic.NotFoundError as exc:
            raise ProviderRejected(
                f"Modell {self.model!r} ist unbekannt (ANTHROPIC_MODEL pruefen)") from exc
        except anthropic.BadRequestError as exc:
            raise ProviderRejected(f"Anfrage abgelehnt: {exc.message}") from exc

    def websuche(self) -> list[dict]:
        """Websuche + Seitenabruf, fuer das eingestellte Modell passend."""
        alt = self.model.startswith(MODELLE_NUR_ALTE_WEBSUCHE)
        suche, abruf = WEBSUCHE_ALT if alt else WEBSUCHE_NEU
        anzahl = get_settings().research_max_searches
        return [
            {"type": suche, "name": "web_search", "max_uses": anzahl,
             "user_location": {"type": "approximate", "country": "DE",
                               "timezone": "Europe/Berlin"}},
            {"type": abruf, "name": "web_fetch", "max_uses": anzahl,
             "max_content_tokens": get_settings().research_max_fetch_tokens},
        ]


def schlusstext(content) -> str:
    """Der Text nach dem letzten Werkzeugaufruf — dort steht das Ergebnis.

    Mit Websuche kommen Zwischentexte ("Ich suche nach …") und Quellenangaben
    dazu; Zitate teilen den Text in mehrere Bloecke, die hier wieder
    zusammengesetzt werden.
    """
    teile: list[str] = []
    for block in content:
        if block.type == "text":
            teile.append(block.text)
        elif block.type not in ("thinking", "redacted_thinking", "fallback"):
            teile = []  # Werkzeugaufruf oder -ergebnis: was davor stand, war Zwischentext
    return "".join(teile)


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


def _bildblock(image_bytes: bytes) -> dict:
    daten, media_type = bild_fuer_erkennung(image_bytes)
    return {"type": "image", "source": {
        "type": "base64", "media_type": media_type,
        "data": base64.standard_b64encode(daten).decode()}}


class AnthropicVisionProvider(VisionProvider):
    name = "anthropic-vision"

    def analyze_product_image(self, image_bytes: bytes, content_type: str) -> VisionAnalysis:
        return self.analyze_product_images([VisionImage(image_bytes, content_type)])

    def analyze_product_images(self, images: list[VisionImage]) -> VisionAnalysis:
        client = AnthropicClient()
        content: list[dict] = []
        bilder = images[:MAX_BILDER]
        for nummer, bild in enumerate(bilder, start=1):
            if len(bilder) > 1:
                ansicht = ROLLEN.get(bild.role, bild.role)
                content.append({"type": "text", "text": f"Bild {nummer} – {ansicht}:"})
            content.append(_bildblock(bild.data))
        prompt = (VISION_MEHRERE_PROMPT if len(bilder) > 1 else "") + VISION_PROMPT
        content.append({"type": "text", "text": prompt})
        raw = client.complete(content)
        return VisionAnalysis.model_validate(_parse_json_block(raw))


def _bekannt(**felder) -> str:
    zeilen = [f"- {name}: {wert}" for name, wert in felder.items() if wert]
    return "\n".join(zeilen) or "- (nichts)"


def _gueltige(liste, schema) -> list:
    """Nur Eintraege uebernehmen, die das Schema erfuellen — Rest verwerfen."""
    ergebnis = []
    for eintrag in liste or []:
        try:
            ergebnis.append(schema.model_validate(eintrag))
        except Exception:
            continue
    return ergebnis


class AnthropicWebResearchProvider(ProductResearchProvider):
    """Produkt- und Preisrecherche: Claude sucht selbst im Netz (Websuche und
    Seitenabruf laufen bei Anthropic). Braucht nur ANTHROPIC_API_KEY."""
    name = "anthropic-websuche"

    def identify_product(self, *, ean: str | None, mpn: str | None,
                         query: str | None) -> list[ResearchCandidate]:
        if not (ean or mpn or query):
            return []
        client = AnthropicClient(_modell("ki_modell_recherche"))
        prompt = IDENTIFY_PROMPT.format(
            bekannt=_bekannt(EAN=ean, Herstellernummer=mpn, Bezeichnung=query))
        raw = client.complete([{"type": "text", "text": prompt}], tools=client.websuche(),
                             effort=getattr(get_settings(), "ki_effort_recherche", None))
        daten = _parse_json_block(raw)
        return _gueltige(daten.get("candidates"), ResearchCandidate)[:3]

    def find_offers(self, *, ean: str | None, query: str, condition: str) -> list[PriceOffer]:
        if not (ean or query):
            return []
        client = AnthropicClient(_modell("ki_modell_recherche"))
        prompt = OFFERS_PROMPT.format(bekannt=_bekannt(EAN=ean, Bezeichnung=query),
                                      zustand=condition or "unbekannt")
        raw = client.complete([{"type": "text", "text": prompt}], tools=client.websuche(),
                             effort=getattr(get_settings(), "ki_effort_recherche", None))
        daten = _parse_json_block(raw)
        return _gueltige(daten.get("offers"), PriceOffer)[:10]


class AnthropicLlmExtractor(LlmExtractor):
    name = "anthropic-llm"

    def extract_voice_data(self, transcript: str) -> VoiceExtraction:
        client = AnthropicClient(_modell("ki_modell_text"))
        raw = client.complete([{"type": "text", "text": VOICE_PROMPT + transcript}])
        return VoiceExtraction.model_validate(_parse_json_block(raw))

    def generate_shop_text(self, verified_fields: dict, unverified_fields: dict) -> ShopTextGeneration:
        client = AnthropicClient(_modell("ki_modell_text"))
        payload = json.dumps(
            {"verifiziert": verified_fields, "unverifiziert": unverified_fields},
            ensure_ascii=False,
            default=str,
        )
        raw = client.complete(
            [{"type": "text", "text": SHOPTEXT_PROMPT + "\n\nProduktdaten:\n" + payload}],
        )
        return ShopTextGeneration.model_validate(_parse_json_block(raw))
