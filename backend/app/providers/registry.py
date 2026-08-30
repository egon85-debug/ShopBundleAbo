"""Provider-Registry: löst Interfaces anhand der Konfiguration auf.
Tests können Provider über set_override() durch Doubles ersetzen."""
from app.config import get_settings
from app.providers.base import (
    ImageOptimizer,
    LlmExtractor,
    ObjectStorage,
    ProductResearchProvider,
    SpeechToTextProvider,
    VisionProvider,
)

_overrides: dict[type, object] = {}
_storage_instance: ObjectStorage | None = None


def set_override(interface: type, instance) -> None:
    _overrides[interface] = instance


def clear_overrides() -> None:
    global _storage_instance
    _overrides.clear()
    _storage_instance = None


def get_vision() -> VisionProvider:
    if VisionProvider in _overrides:
        return _overrides[VisionProvider]
    from app.providers.anthropic_provider import AnthropicVisionProvider
    return AnthropicVisionProvider()


def get_llm() -> LlmExtractor:
    if LlmExtractor in _overrides:
        return _overrides[LlmExtractor]
    from app.providers.anthropic_provider import AnthropicLlmExtractor
    return AnthropicLlmExtractor()


def get_stt() -> SpeechToTextProvider:
    if SpeechToTextProvider in _overrides:
        return _overrides[SpeechToTextProvider]
    from app.providers.stt_whisper import WhisperCompatibleSttProvider
    return WhisperCompatibleSttProvider()


def get_research() -> ProductResearchProvider:
    if ProductResearchProvider in _overrides:
        return _overrides[ProductResearchProvider]
    from app.providers.research_http import HttpProductResearchProvider
    return HttpProductResearchProvider()


def get_image_optimizer() -> ImageOptimizer:
    if ImageOptimizer in _overrides:
        return _overrides[ImageOptimizer]
    from app.providers.image_pillow import PillowImageOptimizer
    return PillowImageOptimizer()


def get_storage() -> ObjectStorage:
    global _storage_instance
    if ObjectStorage in _overrides:
        return _overrides[ObjectStorage]
    if _storage_instance is None:
        if get_settings().storage_backend == "s3":
            from app.providers.storage_s3 import S3ObjectStorage
            _storage_instance = S3ObjectStorage()
        else:
            from app.providers.storage_local import LocalObjectStorage
            _storage_instance = LocalObjectStorage()
    return _storage_instance
