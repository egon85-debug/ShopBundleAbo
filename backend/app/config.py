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

    # KI-Provider
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5"
    stt_api_base: str = "https://api.openai.com/v1"
    stt_api_key: str = ""
    stt_model: str = "whisper-1"
    price_research_api_base: str = ""
    price_research_api_key: str = ""
    background_removal_api_base: str = ""

    # KI-Verhalten
    confidence_threshold: float = 0.85
    voice_retention_hours: int = 0

    # Jobs
    job_max_attempts: int = 5
    job_retry_base_seconds: int = 30
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
