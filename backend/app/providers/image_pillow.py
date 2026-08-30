"""Bildoptimierung für Shopbilder (Anforderung 14).

Pillow-Pipeline: EXIF-Rotation (+ Entfernen der EXIF-Daten inkl. GPS), optionale externe
Freistellung, sanfter Weißabgleich, Belichtung/Kontrast, Zuschnitt/Zentrierung auf 1:1 mit
hellem Rand, Zielauflösung. Das Produkt selbst wird nicht generativ verändert; bei
preserve_condition=True (Schadensfotos) entfallen Freistellung und Aufhellung."""
import io

import httpx
from PIL import Image, ImageEnhance, ImageOps

from app.config import get_settings
from app.providers.base import ImageOptimizer, OptimizedImage

TARGET_SIZE = 1600
BACKGROUND = (250, 250, 250)


class PillowImageOptimizer(ImageOptimizer):
    name = "pillow"

    def optimize(self, image_bytes: bytes, *, preserve_condition: bool = False) -> OptimizedImage:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)  # Rotation anwenden, EXIF fällt beim Re-Save weg
        image = image.convert("RGB")

        if not preserve_condition:
            cutout = self._remove_background(image_bytes)
            if cutout is not None:
                image = cutout
            image = self._auto_white_balance(image)
            image = ImageEnhance.Brightness(image).enhance(1.04)
            image = ImageEnhance.Contrast(image).enhance(1.05)
        else:
            image = ImageEnhance.Contrast(image).enhance(1.02)

        image = self._center_on_square(image)
        image = image.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

        out = io.BytesIO()
        image.save(out, format="JPEG", quality=90, optimize=True)
        return OptimizedImage(data=out.getvalue(), content_type="image/jpeg",
                              width=image.width, height=image.height)

    def _remove_background(self, image_bytes: bytes) -> Image.Image | None:
        """Optionale externe Freistellung (z. B. selbst gehostetes rembg).
        Nicht konfiguriert oder Fehler → None (Pipeline läuft ohne Freistellung weiter)."""
        base = get_settings().background_removal_api_base
        if not base:
            return None
        try:
            response = httpx.post(
                base.rstrip("/") + "/remove",
                files={"file": ("image.jpg", image_bytes, "image/jpeg")},
                timeout=120,
            )
            response.raise_for_status()
            cutout = Image.open(io.BytesIO(response.content)).convert("RGBA")
            canvas = Image.new("RGB", cutout.size, BACKGROUND)
            canvas.paste(cutout, mask=cutout.split()[3])
            return canvas
        except Exception:
            return None

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
    def _center_on_square(image: Image.Image) -> Image.Image:
        side = int(max(image.width, image.height) * 1.06)  # 3 % Rand
        canvas = Image.new("RGB", (side, side), BACKGROUND)
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        return canvas
