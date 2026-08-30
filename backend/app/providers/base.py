"""Provider-Interfaces (Anforderung 34): Externe Dienste sind austauschbar.
Services und Job-Handler programmieren ausschließlich gegen diese Abstraktionen."""
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.schemas.ai import (
    PriceOffer,
    ResearchCandidate,
    ShopTextGeneration,
    VisionAnalysis,
    VoiceExtraction,
)


class ProviderNotConfigured(Exception):
    """Provider ist nicht konfiguriert (fehlender API-Key o. ä.).
    Jobs schlagen damit kontrolliert fehl und werden erneut versucht."""


class VisionProvider(ABC):
    name: str = "vision"

    @abstractmethod
    def analyze_product_image(self, image_bytes: bytes, content_type: str) -> VisionAnalysis:
        """Bildanalyse inkl. OCR: Hersteller, Modell, EAN, Kategorie … mit Confidence."""


class SpeechToTextProvider(ABC):
    name: str = "stt"

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, content_type: str, language: str = "de") -> str: ...


class LlmExtractor(ABC):
    name: str = "llm"

    @abstractmethod
    def extract_voice_data(self, transcript: str) -> VoiceExtraction: ...

    @abstractmethod
    def generate_shop_text(self, verified_fields: dict, unverified_fields: dict) -> ShopTextGeneration: ...


class ProductResearchProvider(ABC):
    name: str = "research"

    @abstractmethod
    def identify_product(
        self, *, ean: str | None, mpn: str | None, query: str | None
    ) -> list[ResearchCandidate]: ...

    @abstractmethod
    def find_offers(self, *, ean: str | None, query: str, condition: str) -> list[PriceOffer]: ...


@dataclass
class OptimizedImage:
    data: bytes
    content_type: str
    width: int
    height: int


class ImageOptimizer(ABC):
    name: str = "image"

    @abstractmethod
    def optimize(self, image_bytes: bytes, *, preserve_condition: bool = False) -> OptimizedImage:
        """Erzeugt ein Shopbild. preserve_condition=True (z. B. Schadensfotos):
        nur Belichtung/Zuschnitt, keine Freistellung/„Verschönerung“."""


class ObjectStorage(ABC):
    name: str = "storage"

    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def get(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def public_url(self, key: str) -> str | None:
        """Öffentliche URL (für Shop-Bilder), sofern konfiguriert."""
