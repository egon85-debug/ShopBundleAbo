"""Speech-to-Text über eine Whisper-kompatible HTTP-API (OpenAI, Groq,
selbst gehostetes whisper.cpp/faster-whisper — konfigurierbar über STT_API_BASE)."""
import httpx

from app.config import get_settings
from app.providers.base import ProviderNotConfigured, SpeechToTextProvider


class WhisperCompatibleSttProvider(SpeechToTextProvider):
    name = "whisper-http"

    def transcribe(self, audio_bytes: bytes, content_type: str, language: str = "de") -> str:
        s = get_settings()
        if not s.stt_api_key:
            raise ProviderNotConfigured("STT_API_KEY ist nicht gesetzt")
        ext = {"audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
               "audio/ogg": "ogg", "audio/webm": "webm", "audio/x-wav": "wav"}.get(content_type, "m4a")
        response = httpx.post(
            s.stt_api_base.rstrip("/") + "/audio/transcriptions",
            headers={"Authorization": f"Bearer {s.stt_api_key}"},
            data={"model": s.stt_model, "language": language, "response_format": "json"},
            files={"file": (f"recording.{ext}", audio_bytes, content_type)},
            timeout=300,
        )
        response.raise_for_status()
        return response.json().get("text", "").strip()
