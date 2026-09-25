"""Shopbild: Freistellen, Zuschnitt auf reines Weiss — und sichere Rueckfallwege.
Statt des rembg-Modells steckt eine Attrappe drin, die eine Maske liefert."""
import io

import pytest
from PIL import Image, ImageDraw

from app.config import get_settings
from app.providers.image_pillow import PillowImageOptimizer, TARGET_SIZE


def _foto() -> bytes:
    """Grauer Hintergrund, rotes Produkt links oben."""
    bild = Image.new("RGB", (1200, 900), (140, 140, 135))
    ImageDraw.Draw(bild).rectangle([100, 100, 400, 700], fill=(200, 30, 35))
    puffer = io.BytesIO()
    bild.save(puffer, format="JPEG", quality=95)
    return puffer.getvalue()


def _maske_produkt(bild: Image.Image) -> Image.Image:
    """Wie rembg: Produkt deckend, Hintergrund durchsichtig (auf verkleinertem Bild)."""
    rgba = bild.convert("RGBA")
    alpha = Image.new("L", bild.size, 0)
    sx, sy = bild.width / 1200, bild.height / 900
    ImageDraw.Draw(alpha).rectangle([100 * sx, 100 * sy, 400 * sx, 700 * sy], fill=255)
    rgba.putalpha(alpha)
    return rgba


@pytest.fixture(autouse=True)
def einstellungen(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "background_removal", "auto")
    monkeypatch.setattr(s, "background_removal_api_base", "")
    return s


def _ergebnis(optimizer, **kw) -> Image.Image:
    r = optimizer.optimize(_foto(), **kw)
    assert (r.width, r.height) == (TARGET_SIZE, TARGET_SIZE)
    return Image.open(io.BytesIO(r.data)).convert("RGB")


def test_freigestellt_auf_weiss_und_zugeschnitten():
    bild = _ergebnis(PillowImageOptimizer(lokal_freistellen=_maske_produkt))
    # Ecken reinweiss (JPEG: fast 255), Mitte das rote Produkt
    assert min(bild.getpixel((5, 5))) >= 250
    r, g, b = bild.getpixel((TARGET_SIZE // 2, TARGET_SIZE // 2))
    assert r > 150 and g < 80
    # Zugeschnitten: das Produkt (300×600) fuellt die Hoehe bis auf den Rand
    zeile = [bild.getpixel((TARGET_SIZE // 2, y))[1] < 120 for y in range(TARGET_SIZE)]
    assert sum(zeile) > TARGET_SIZE * 0.8


def test_unplausible_maske_wird_verworfen():
    """Fast alles durchsichtig → nicht freistellen, Hintergrund bleibt."""
    def fast_nichts(bild):
        rgba = bild.convert("RGBA")
        rgba.putalpha(Image.new("L", bild.size, 0))
        return rgba
    bild = _ergebnis(PillowImageOptimizer(lokal_freistellen=fast_nichts))
    # rechts neben dem Produkt: grauer Fotohintergrund statt Weiss
    assert max(bild.getpixel((1400, TARGET_SIZE // 2))) < 200


def test_fehler_beim_freistellen_bricht_nichts_ab():
    def kaputt(bild):
        raise RuntimeError("Modell nicht ladbar")
    _ergebnis(PillowImageOptimizer(lokal_freistellen=kaputt))


def test_ohne_rembg_wie_bisher():
    _ergebnis(PillowImageOptimizer(lokal_freistellen=lambda bild: None))


def test_schadensfoto_wird_nicht_freigestellt():
    aufrufe = []
    def merken(bild):
        aufrufe.append(1)
        return _maske_produkt(bild)
    _ergebnis(PillowImageOptimizer(lokal_freistellen=merken), preserve_condition=True)
    assert aufrufe == []


def test_abschaltbar(einstellungen):
    einstellungen.background_removal = "off"
    aufrufe = []
    _ergebnis(PillowImageOptimizer(lokal_freistellen=lambda b: aufrufe.append(1)))
    assert aufrufe == []
