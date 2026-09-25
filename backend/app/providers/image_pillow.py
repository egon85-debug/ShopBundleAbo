"""Bildoptimierung für Shopbilder (Anforderung 14).

Pillow-Pipeline: EXIF-Rotation (+ Entfernen der EXIF-Daten inkl. GPS), Freistellung,
Zuschnitt auf das Produkt, Zentrierung auf einem reinweißen Quadrat, Zielauflösung.

Freistellen: ein externer Dienst (BACKGROUND_REMOVAL_API_BASE) oder lokal auf dem
Server mit dem Segmentierungsmodell IS-Net (ONNX, CPU). Beides trennt nur Vorder- und
Hintergrund — das Produkt selbst wird nicht generativ verändert, jedes Pixel des
Produkts stammt aus dem Foto. Sieht die Maske unplausibel aus (fast nichts oder fast
alles Vordergrund), bleibt es beim ursprünglichen Hintergrund. Bei
preserve_condition=True (Schadensfotos) entfallen Freistellung und Aufhellung. Das Original bleibt
unverändert erhalten; das Shopbild ist eine eigene Datei.
"""
import io
import logging
import threading
from collections.abc import Callable
from pathlib import Path

import httpx
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from app.config import get_settings
from app.providers.base import ImageOptimizer, OptimizedImage

log = logging.getLogger("winterfeld.bilder")

TARGET_SIZE = 1600
BACKGROUND = (250, 250, 250)
WEISS = (255, 255, 255)
# Rand um das freigestellte Produkt, je Seite (Anteil der längsten Kante).
RAND = 0.07
# Bilder werden vor dem Freistellen auf diese Kante verkleinert — mehr braucht
# ein 1600er-Shopbild nicht, und es spart Rechenzeit und Speicher.
FREISTELL_KANTE = 2000
# Plausibler Anteil des Vordergrunds; alles außerhalb ist ein Fehlschlag.
MIN_VORDERGRUND, MAX_VORDERGRUND = 0.02, 0.97

_sitzung = None
_sitzung_lock = threading.Lock()


def _onnx_freistellen(image: Image.Image) -> Image.Image | None:
    """Lokal freistellen mit IS-Net; None, wenn Modell oder onnxruntime fehlen.

    Vor- und Nachbereitung wie in rembg (dort "isnet-general-use"), aber ohne
    dessen Abhaengigkeiten — die uebersetzten beim Start fast eine Minute lang
    Code fuer eine Funktion, die hier nicht gebraucht wird.
    """
    global _sitzung
    pfad = Path(get_settings().background_removal_model)
    if not pfad.exists():
        return None
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError:
        return None
    with _sitzung_lock:  # Modell einmal laden, dann wiederverwenden
        if _sitzung is None:
            _sitzung = ort.InferenceSession(str(pfad), providers=["CPUExecutionProvider"])
        eingabe = np.asarray(image.convert("RGB").resize((1024, 1024), Image.LANCZOS),
                             dtype=np.float32)
        eingabe = eingabe / max(float(eingabe.max()), 1e-6) - 0.5
        tensor = eingabe.transpose(2, 0, 1)[np.newaxis]
        vorhersage = _sitzung.run(None, {_sitzung.get_inputs()[0].name: tensor})[0][0, 0]
    klein, gross = float(vorhersage.min()), float(vorhersage.max())
    maske = (vorhersage - klein) / max(gross - klein, 1e-6)
    maske = Image.fromarray((maske * 255).astype("uint8"), mode="L")
    maske = maske.resize(image.size, Image.LANCZOS)
    # Vereinzelte Flecken weg (Oeffnen), Schleier im Hintergrund weg, Kante weich
    maske = maske.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    maske = maske.point(lambda a: 0 if a < 40 else 255 if a > 215 else (a - 40) * 255 // 175)
    maske = maske.filter(ImageFilter.GaussianBlur(1))
    rgba = image.convert("RGBA")
    rgba.putalpha(maske)
    return rgba


class PillowImageOptimizer(ImageOptimizer):
    name = "pillow"

    def __init__(self, lokal_freistellen: Callable[[Image.Image], Image.Image | None]
                 = _onnx_freistellen) -> None:
        self._lokal_freistellen = lokal_freistellen

    def optimize(self, image_bytes: bytes, *, preserve_condition: bool = False) -> OptimizedImage:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)  # Rotation anwenden, EXIF fällt beim Re-Save weg
        image = image.convert("RGB")

        if preserve_condition:
            image = ImageEnhance.Contrast(image).enhance(1.02)
            image = self._center_on_square(image, BACKGROUND)
        else:
            freigestellt = self._freistellen(image, image_bytes)
            if freigestellt is not None:
                image = self._auf_weiss(freigestellt)
            else:
                image = self._auto_white_balance(image)
                image = ImageEnhance.Brightness(image).enhance(1.04)
                image = ImageEnhance.Contrast(image).enhance(1.05)
                image = self._center_on_square(image, BACKGROUND)

        image = image.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=90, optimize=True)
        return OptimizedImage(data=out.getvalue(), content_type="image/jpeg",
                              width=image.width, height=image.height)

    # ── Freistellen ─────────────────────────────────────────────────────────

    def _freistellen(self, image: Image.Image, image_bytes: bytes) -> Image.Image | None:
        """Produkt mit Transparenz (RGBA) oder None, wenn es nicht gelingt."""
        s = get_settings()
        if s.background_removal.lower() == "off":
            return None
        kleiner = image.copy()
        kleiner.thumbnail((FREISTELL_KANTE, FREISTELL_KANTE), Image.LANCZOS)
        try:
            if s.background_removal_api_base:
                ergebnis = self._extern_freistellen(kleiner, s.background_removal_api_base)
            else:
                ergebnis = self._lokal_freistellen(kleiner)
        except Exception as exc:  # Freistellen ist Kür — nie deswegen scheitern
            log.warning("Freistellen fehlgeschlagen: %s", exc)
            return None
        if ergebnis is None or not self._maske_plausibel(ergebnis):
            return None
        return ergebnis

    @staticmethod
    def _extern_freistellen(image: Image.Image, base: str) -> Image.Image:
        """Externer Dienst (z. B. selbst gehostetes rembg) mit POST /remove."""
        puffer = io.BytesIO()
        image.save(puffer, format="JPEG", quality=92)
        response = httpx.post(base.rstrip("/") + "/remove",
                              files={"file": ("image.jpg", puffer.getvalue(), "image/jpeg")},
                              timeout=120)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content)).convert("RGBA")

    @staticmethod
    def _maske_plausibel(rgba: Image.Image) -> bool:
        histogramm = rgba.getchannel("A").histogram()
        vordergrund = sum(histogramm[128:]) / max(1, rgba.width * rgba.height)
        if not MIN_VORDERGRUND <= vordergrund <= MAX_VORDERGRUND:
            log.info("Freistellung verworfen: %.1f %% Vordergrund", vordergrund * 100)
            return False
        return True

    @staticmethod
    def _auf_weiss(rgba: Image.Image) -> Image.Image:
        """Auf das Produkt zuschneiden und mittig auf reines Weiß setzen."""
        # Fast durchsichtige Randpixel (Schatten-Reste) bestimmen den Zuschnitt nicht.
        maske = rgba.getchannel("A").point(lambda a: 255 if a > 24 else 0)
        box = maske.getbbox() or (0, 0, rgba.width, rgba.height)
        produkt = rgba.crop(box)
        seite = int(max(produkt.width, produkt.height) * (1 + 2 * RAND))
        leinwand = Image.new("RGB", (seite, seite), WEISS)
        leinwand.paste(produkt, ((seite - produkt.width) // 2, (seite - produkt.height) // 2),
                       mask=produkt.getchannel("A"))
        return leinwand

    # ── Ohne Freistellung ───────────────────────────────────────────────────

    @staticmethod
    def _auto_white_balance(image: Image.Image) -> Image.Image:
        """Grauwelt-Annahme, bewusst gedämpft, um Produktfarben nicht zu verfälschen."""
        r, g, b = image.split()
        averages = [max(1.0, sum(ch.histogram()[i] * i for i in range(256)) /
                        max(1, image.width * image.height)) for ch in (r, g, b)]
        gray = sum(averages) / 3
        channels = []
        for ch, avg in zip((r, g, b), averages):
            factor = 1.0 + 0.5 * (gray / avg - 1.0)  # nur halbe Korrektur
            channels.append(ch.point(lambda p, f=factor: min(255, int(p * f))))
        return Image.merge("RGB", channels)

    @staticmethod
    def _center_on_square(image: Image.Image, farbe=BACKGROUND) -> Image.Image:
        side = int(max(image.width, image.height) * 1.06)  # 3 % Rand
        canvas = Image.new("RGB", (side, side), farbe)
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        return canvas
