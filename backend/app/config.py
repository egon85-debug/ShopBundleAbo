"""Zentrale Konfiguration. Alle Secrets kommen aus der Umgebung (.env),
niemals aus dem Quellcode."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Datenbank
    database_url: str = "postgresql+psycopg2://winterfeld:winterfeld@localhost:5432/winterfeld"

    # Sicherheit
    jwt_secret: str = "dev-only-insecure-secret"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    credentials_key: str = ""  # Fernet-Key für Shop-Credentials
    environment: str = "development"
    cors_origins: str = "http://localhost:8000"

    # Storage
    storage_backend: str = "local"  # local | s3
    storage_local_path: str = "./storage"
    # Nur um die Android-App aus einem privaten Repository zu holen (app-holen).
    github_token: str = ""
    s3_endpoint_url: str = ""
    s3_bucket: str = "winterfeld-media"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "eu-central-1"
    media_public_base_url: str = ""
    # Oeffentlicher Name des Servers (derselbe Wert wie fuer den Reverse Proxy).
    # Ohne MEDIA_PUBLIC_BASE_URL werden Bildadressen daraus gebildet — der
    # Shop braucht sie absolut, sonst kommen keine Bilder an.
    domain: str = ""

    def oeffentliche_basis(self) -> str:
        """https://<domain> oder leer."""
        name = self.domain.strip().removeprefix("https://").removeprefix("http://").rstrip("/")
        return f"https://{name}" if name else ""

    # KI-Provider
    anthropic_api_key: str = ""
    # Sonnet 5 kostet etwa 40 % von Opus 5 – nötig für das Budget je Artikel.
    anthropic_model: str = "claude-sonnet-5"
    stt_api_base: str = "https://api.openai.com/v1"
    stt_api_key: str = ""
    stt_model: str = "whisper-1"
    price_research_api_base: str = ""
    price_research_api_key: str = ""
    # Produkt- und Preisrecherche: auto = eigene Recherche-API, falls
    # PRICE_RESEARCH_API_BASE gesetzt ist, sonst Claude mit Websuche
    # (braucht nur ANTHROPIC_API_KEY). anthropic | http | off erzwingen.
    research_provider: str = "auto"
    # Websuchen je Recherche (Anthropic berechnet sie einzeln, ca. 1 Cent).
    research_max_searches: int = 2
    # Abgerufene Seiten werden auf so viele Tokens gekürzt – ganze Shopseiten
    # sind sonst der größte Kostenblock einer Recherche.
    research_max_fetch_tokens: int = 6000
    # Harte Obergrenze der KI-Kosten je Artikel in US-Dollar (Listenpreise).
    # Vor jedem KI-Schritt wird geprüft, ob das Restbudget dafür reicht.
    ki_budget_je_artikel_usd: float = 0.35
    background_removal_api_base: str = ""
    # Hintergrund entfernen: auto = externer Dienst, falls
    # BACKGROUND_REMOVAL_API_BASE gesetzt ist, sonst lokal auf dem Server
    # (siehe background_removal_model). off = nur aufhellen und zentrieren.
    background_removal: str = "auto"
    # Segmentierungsmodell IS-Net; das Docker-Image bringt es mit.
    background_removal_model: str = "/opt/modelle/isnet-general-use.onnx"
    # Nach dem ersten Foto kurz warten, damit Rueckseite, Typenschild und
    # Barcode in dieselbe Erkennung eingehen.
    recognition_delay_seconds: int = 20

    # KI-Verhalten
    confidence_threshold: float = 0.85
    voice_retention_hours: int = 0

    # Jobs
    job_max_attempts: int = 5
    job_retry_base_seconds: int = 30
    # Nach so vielen Minuten gilt ein Auftrag in „running“ als abgebrochen
    # (Prozess neu gestartet) und wird wieder eingeplant. Länger als der
    # längste echte Auftrag (Erkennung mit Websuche: wenige Minuten).
    job_stale_minutes: int = 15
    # Job-Worker im selben Prozess wie die API starten. Für kleine Installationen
    # (ein Lager, wenige Tablets) genügt das und spart einen zweiten Dienst.
    # Bei mehreren API-Prozessen liefe er mehrfach – dann besser als eigener
    # Dienst betreiben ("worker" als Startbefehl des Containers).
    run_worker_in_process: bool = False

    # Rate Limiting
    rate_limit_auth_per_minute: int = 10
    rate_limit_upload_per_minute: int = 120

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
