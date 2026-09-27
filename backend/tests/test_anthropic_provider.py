"""Anbindung an die Anthropic-API — mit einer Attrappe statt des echten SDK-Clients.

Geprueft wird, was gesendet wird und wie jede Antwortart ankommt: Bildaufbereitung,
Ausweichmodell bei Ablehnungen, dauerhafte Fehler, abgeschnittene Antworten.
"""
import io
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from PIL import Image

from app.providers import anthropic_provider as ap
from app.providers.base import ProviderNotConfigured, ProviderRejected


def _antwort(text='{"ok": true}', stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="thinking", thinking=""),
                 SimpleNamespace(type="text", text=text)],
    )


class _Attrappe:
    """Nimmt Aufrufe entgegen wie anthropic.Anthropic und merkt sich, welche."""

    def __init__(self, **kwargs):
        self.aufrufe: list[tuple[str, dict]] = []
        self.antwort = _antwort()
        self.fehler: Exception | None = None
        attrappe = self

        class _Messages:
            def __init__(self, weg):
                self.weg = weg

            def create(self, **anfrage):
                attrappe.aufrufe.append((self.weg, anfrage))
                if attrappe.fehler:
                    raise attrappe.fehler
                return attrappe.antwort

        self.messages = _Messages("messages")
        self.beta = SimpleNamespace(messages=_Messages("beta"))


@pytest.fixture()
def client(monkeypatch):
    """Ein AnthropicClient mit Attrappe; Modell per client.model aenderbar."""
    einstellungen = SimpleNamespace(anthropic_api_key="sk-test", anthropic_model="claude-opus-5")
    monkeypatch.setattr(ap, "get_settings", lambda: einstellungen)
    attrappe = _Attrappe()
    monkeypatch.setattr(ap.anthropic, "Anthropic", lambda **kw: attrappe)
    c = ap.AnthropicClient()
    c.attrappe = attrappe
    return c


def _fehler(klasse, status):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return klasse("Fehler", response=httpx2.Response(status, request=request), body=None)


class TestAnfrage:
    def test_ohne_schluessel_nicht_eingerichtet(self, monkeypatch):
        monkeypatch.setattr(ap, "get_settings", lambda: SimpleNamespace(
            anthropic_api_key="", anthropic_model="claude-opus-5"))
        with pytest.raises(ProviderNotConfigured):
            ap.AnthropicClient()

    def test_opus_mit_ausweichmodell(self, client):
        client.complete([{"type": "text", "text": "hallo"}])
        weg, anfrage = client.attrappe.aufrufe[0]
        assert weg == "beta"
        assert anfrage["betas"] == ["server-side-fallback-2026-07-01"]
        assert anfrage["fallbacks"] == "default"
        assert anfrage["model"] == "claude-opus-5"

    def test_sonnet_ohne_ausweichmodell(self, client):
        client.model = "claude-sonnet-5"
        client.complete([{"type": "text", "text": "hallo"}])
        weg, anfrage = client.attrappe.aufrufe[0]
        assert weg == "messages"
        assert "fallbacks" not in anfrage and "betas" not in anfrage

    def test_genug_platz_zum_denken(self, client):
        # Das Modell denkt vor der Antwort, und das zaehlt mit. 2048 wie frueher
        # haetten das JSON mittendrin abgeschnitten.
        client.complete([{"type": "text", "text": "hallo"}])
        assert client.attrappe.aufrufe[0][1]["max_tokens"] >= 16000

    def test_nur_textbloecke_zaehlen(self, client):
        client.attrappe.antwort = _antwort(text='{"a": 1}')
        assert client.complete([{"type": "text", "text": "x"}]) == '{"a": 1}'


class TestFehler:
    @pytest.mark.parametrize("klasse,status,hinweis", [
        (anthropic.AuthenticationError, 401, "ANTHROPIC_API_KEY"),
        (anthropic.PermissionDeniedError, 403, "ANTHROPIC_API_KEY"),
        (anthropic.NotFoundError, 404, "ANTHROPIC_MODEL"),
        (anthropic.BadRequestError, 400, "abgelehnt"),
    ])
    def test_dauerhafte_fehler(self, client, klasse, status, hinweis):
        client.attrappe.fehler = _fehler(klasse, status)
        with pytest.raises(ProviderRejected, match=hinweis):
            client.complete([{"type": "text", "text": "x"}])

    def test_voruebergehende_fehler_bleiben_wiederholbar(self, client):
        # 429/5xx wiederholt das SDK selbst; was durchkommt, wiederholt die Queue.
        client.attrappe.fehler = _fehler(anthropic.RateLimitError, 429)
        with pytest.raises(anthropic.RateLimitError):
            client.complete([{"type": "text", "text": "x"}])

    def test_ablehnung_des_modells(self, client):
        client.attrappe.antwort = _antwort(text="", stop_reason="refusal")
        with pytest.raises(ProviderRejected, match="abgelehnt"):
            client.complete([{"type": "text", "text": "x"}])

    def test_abgeschnittene_antwort(self, client):
        client.attrappe.antwort = _antwort(text='{"halb', stop_reason="max_tokens")
        with pytest.raises(ProviderRejected, match="abgeschnitten"):
            client.complete([{"type": "text", "text": "x"}])


def _handyfoto(breite=4000, hoehe=3000, exif_drehung=None) -> bytes:
    bild = Image.effect_noise((breite, hoehe), 64).convert("RGB")  # rauscht wie ein Foto
    puffer = io.BytesIO()
    if exif_drehung:
        exif = Image.Exif()
        exif[0x0112] = exif_drehung
        bild.save(puffer, format="JPEG", quality=95, exif=exif)
    else:
        bild.save(puffer, format="JPEG", quality=95)
    return puffer.getvalue()


class TestBildaufbereitung:
    def test_grosses_handyfoto_wird_kleiner_als_die_grenze(self):
        original = _handyfoto()
        assert len(original) > 5 * 1024 * 1024, "Testfoto soll ueber der 5-MB-Grenze liegen"
        daten, typ = ap.bild_fuer_erkennung(original)
        assert typ == "image/jpeg"
        assert len(daten) < 5 * 1024 * 1024
        with Image.open(io.BytesIO(daten)) as bild:
            assert max(bild.size) == ap.MAX_BILDKANTE

    def test_kleines_bild_wird_nicht_vergroessert(self):
        daten, _ = ap.bild_fuer_erkennung(_handyfoto(800, 600))
        with Image.open(io.BytesIO(daten)) as bild:
            assert bild.size == (800, 600)

    def test_exif_drehung_wird_angewendet(self):
        # Orientierung 6: Kamera hochkant gehalten, Pixel liegen quer.
        daten, _ = ap.bild_fuer_erkennung(_handyfoto(1200, 800, exif_drehung=6))
        with Image.open(io.BytesIO(daten)) as bild:
            assert bild.size == (800, 1200)

    def test_vision_sendet_das_aufbereitete_bild(self, client, monkeypatch):
        client.attrappe.antwort = _antwort(text='{"ean": "4006381333931", "confidence": {}}')
        monkeypatch.setattr(ap, "AnthropicClient", lambda: client)
        ergebnis = ap.AnthropicVisionProvider().analyze_product_image(_handyfoto(), "image/jpeg")
        assert ergebnis.ean == "4006381333931"
        bildblock = client.attrappe.aufrufe[0][1]["messages"][0]["content"][0]
        assert bildblock["source"]["media_type"] == "image/jpeg"
        # Base64 eines Bildes unter 5 MB bleibt unter ~6,7 MB.
        assert len(bildblock["source"]["data"]) < 7 * 1024 * 1024


# ── Mehrere Fotos und Recherche mit Websuche ─────────────────────────────────

def _block(typ, **felder):
    return SimpleNamespace(type=typ, **felder)


def _jpeg():
    puffer = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 10, 10)).save(puffer, format="JPEG")
    return puffer.getvalue()


@pytest.fixture()
def recherche(monkeypatch):
    """Einstellungen + Attrappe fuer Anbieter, die ihren Client selbst bauen."""
    einstellungen = SimpleNamespace(anthropic_api_key="sk-test", anthropic_model="claude-sonnet-5",
                                    research_max_searches=3, research_max_fetch_tokens=6000)
    monkeypatch.setattr(ap, "get_settings", lambda: einstellungen)
    attrappe = _Attrappe()
    monkeypatch.setattr(ap.anthropic, "Anthropic", lambda **kw: attrappe)
    attrappe.einstellungen = einstellungen
    return attrappe


class TestMehrereFotos:
    def test_alle_fotos_mit_ansicht_in_einer_anfrage(self, recherche):
        from app.providers.base import VisionImage
        recherche.antwort = _antwort('{"product_name": "Makita DHP484Z", "ean": null}')
        ergebnis = ap.AnthropicVisionProvider().analyze_product_images([
            VisionImage(_jpeg(), "image/jpeg", "front"),
            VisionImage(_jpeg(), "image/jpeg", "type_plate"),
            VisionImage(_jpeg(), "image/jpeg", "barcode"),
        ])
        assert ergebnis.product_name == "Makita DHP484Z"
        inhalt = recherche.aufrufe[0][1]["messages"][0]["content"]
        assert [b["type"] for b in inhalt].count("image") == 3
        texte = " ".join(b["text"] for b in inhalt if b["type"] == "text")
        assert "Bild 2 – Typenschild" in texte and "DENSELBEN Artikel" in texte

    def test_hoechstens_sechs_fotos(self, recherche):
        from app.providers.base import VisionImage
        recherche.antwort = _antwort('{}')
        ap.AnthropicVisionProvider().analyze_product_images(
            [VisionImage(_jpeg(), "image/jpeg", "front")] * 9)
        inhalt = recherche.aufrufe[0][1]["messages"][0]["content"]
        assert [b["type"] for b in inhalt].count("image") == ap.MAX_BILDER


class TestWebRecherche:
    def test_websuche_mit_deutschem_standort(self, recherche):
        recherche.antwort = _antwort('{"candidates": []}')
        ap.AnthropicWebResearchProvider().identify_product(ean="4006381333931", mpn=None,
                                                           query=None)
        werkzeuge = recherche.aufrufe[0][1]["tools"]
        assert werkzeuge[0]["type"] == "web_search_20260209"
        assert werkzeuge[0]["max_uses"] == 3
        assert werkzeuge[0]["user_location"]["country"] == "DE"
        assert werkzeuge[1]["type"] == "web_fetch_20260209"
        assert "4006381333931" in recherche.aufrufe[0][1]["messages"][0]["content"][0]["text"]

    def test_aeltere_modelle_bekommen_die_grundversion(self, recherche):
        recherche.einstellungen.anthropic_model = "claude-haiku-4-5"
        recherche.antwort = _antwort('{"candidates": []}')
        ap.AnthropicWebResearchProvider().identify_product(ean="4006381333931", mpn=None,
                                                           query=None)
        assert recherche.aufrufe[0][1]["tools"][0]["type"] == "web_search_20250305"

    def test_ergebnis_nach_suche_und_zitaten(self, recherche):
        """Zwischentext und Suchergebnisse zaehlen nicht; Zitate teilen das JSON
        in mehrere Textbloecke, die wieder zusammengesetzt werden."""
        recherche.antwort = SimpleNamespace(stop_reason="end_turn", content=[
            _block("text", text="Ich suche nach der EAN {…}"),
            _block("server_tool_use", id="s1", name="web_search", input={}),
            _block("web_search_tool_result", tool_use_id="s1", content=[]),
            _block("text", text='{"candidates": [{"product_name": "Stabilo Boss", '),
            _block("text", text='"ean": "4006381333931", "match_score": 0.97, '
                                '"source_url": "https://stabilo.example/boss"}]}'),
        ])
        treffer = ap.AnthropicWebResearchProvider().identify_product(
            ean="4006381333931", mpn=None, query=None)
        assert len(treffer) == 1
        assert treffer[0].product_name == "Stabilo Boss"
        assert treffer[0].match_score == 0.97

    def test_unterbrochene_suche_wird_fortgesetzt(self, recherche):
        pausiert = SimpleNamespace(stop_reason="pause_turn", content=[
            _block("server_tool_use", id="s1", name="web_search", input={})])
        fertig = _antwort('{"offers": [{"price": "59.90", "condition": "new", '
                          '"url": "https://shop.example", "is_same_variant": true}, '
                          '{"price": "kostenlos"}]}')
        antworten = iter([pausiert, fertig])
        recherche.antwort = None
        original = recherche.messages.create

        def create(**anfrage):
            recherche.aufrufe.append(("messages", anfrage))
            return next(antworten)
        recherche.messages.create = create

        angebote = ap.AnthropicWebResearchProvider().find_offers(
            ean=None, query="Makita DHP484Z", condition="new")
        # Zweiter Aufruf schickt die pausierte Antwort zurueck, ohne neue Nutzernachricht
        zweite = recherche.aufrufe[1][1]["messages"]
        assert [m["role"] for m in zweite] == ["user", "assistant"]
        # Unbrauchbare Eintraege (Preis "kostenlos") werden verworfen, nicht geraten
        assert len(angebote) == 1 and str(angebote[0].price) == "59.90"
        recherche.messages.create = original

    def test_ohne_suchbegriff_keine_kosten(self, recherche):
        assert ap.AnthropicWebResearchProvider().identify_product(
            ean=None, mpn=None, query=None) == []
        assert recherche.aufrufe == []
