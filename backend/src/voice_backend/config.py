from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+psycopg://voice:voice@localhost:5432/voice"


class Settings(BaseSettings):
    service_name: str = "voice-backend"
    environment: Literal["dev", "test", "prod"] = Field(
        default="dev",
        validation_alias=AliasChoices("VOICE_ENVIRONMENT"),
    )
    host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("VOICE_BACKEND_HOST"))
    port: int = Field(default=8100, validation_alias=AliasChoices("VOICE_BACKEND_PORT"))
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("VOICE_LOG_LEVEL"))
    secret_encryption_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_SECRET_ENCRYPTION_KEY"),
    )
    session_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_SESSION_SECRET"),
    )
    session_cookie_name: str = Field(
        default="voice_session",
        validation_alias=AliasChoices("VOICE_SESSION_COOKIE_NAME"),
    )
    session_ttl_hours: int = Field(
        default=12,
        validation_alias=AliasChoices("VOICE_SESSION_TTL_HOURS"),
    )
    password_hash_iterations: int = Field(
        default=150_000,
        validation_alias=AliasChoices("VOICE_PASSWORD_HASH_ITERATIONS"),
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        validation_alias=AliasChoices("VOICE_BACKEND_CORS_ORIGINS"),
    )
    pipeline_base_url: str = Field(
        default="http://127.0.0.1:8101",
        validation_alias=AliasChoices("VOICE_PIPELINE_BASE_URL"),
    )
    livekit_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_LIVEKIT_URL"),
    )
    livekit_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_LIVEKIT_API_KEY"),
    )
    livekit_api_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_LIVEKIT_API_SECRET"),
    )
    livekit_agent_name: str = Field(
        default="voice-router-agent",
        validation_alias=AliasChoices("VOICE_LIVEKIT_AGENT_NAME"),
    )
    livekit_room_empty_timeout_seconds: int = Field(
        default=600,
        validation_alias=AliasChoices("VOICE_LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS"),
    )
    livekit_token_ttl_minutes: int = Field(
        default=60,
        validation_alias=AliasChoices("VOICE_LIVEKIT_TOKEN_TTL_MINUTES"),
    )
    internal_api_key: str = Field(
        default="voice-local-internal-key",
        validation_alias=AliasChoices("VOICE_INTERNAL_API_KEY"),
    )
    backend_base_url: str = Field(
        default="http://127.0.0.1:8100",
        validation_alias=AliasChoices("VOICE_BACKEND_BASE_URL"),
    )
    recordings_dir: str = Field(
        default="var/recordings",
        validation_alias=AliasChoices("VOICE_RECORDINGS_DIR"),
    )
    database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_DATABASE_URL"),
    )
    database_url_dev: str | None = Field(
        default=None, validation_alias=AliasChoices("VOICE_DATABASE_URL_DEV")
    )
    database_url_test: str | None = Field(
        default=None, validation_alias=AliasChoices("VOICE_DATABASE_URL_TEST")
    )
    database_url_prod: str | None = Field(
        default=None, validation_alias=AliasChoices("VOICE_DATABASE_URL_PROD")
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @model_validator(mode="after")
    def resolve_database_url(self) -> "Settings":
        if self.database_url is not None:
            resolved = self
        else:
            database_urls = {
                "dev": self.database_url_dev or DEFAULT_DATABASE_URL,
                "test": self.database_url_test or self.database_url_dev or DEFAULT_DATABASE_URL,
                "prod": self.database_url_prod,
            }
            selected_database_url = database_urls[self.environment]
            if selected_database_url is None:
                raise ValueError(
                    f"database URL for environment '{self.environment}' is not configured"
                )
            object.__setattr__(self, "database_url", selected_database_url)
            resolved = self

        if resolved.session_secret is None:
            if resolved.environment == "prod":
                raise ValueError("VOICE_SESSION_SECRET must be configured for production")
            object.__setattr__(resolved, "session_secret", "voice-local-dev-session-secret")
        if resolved.secret_encryption_key is None:
            if resolved.environment == "prod":
                raise ValueError("VOICE_SECRET_ENCRYPTION_KEY must be configured for production")
            object.__setattr__(resolved, "secret_encryption_key", "voice-local-dev-encryption-key")
        if resolved.environment != "prod" and resolved.password_hash_iterations == 150_000:
            object.__setattr__(resolved, "password_hash_iterations", 1_000)

        livekit_url = (
            resolved.livekit_url.strip() if isinstance(resolved.livekit_url, str) else None
        )
        livekit_api_key = (
            resolved.livekit_api_key.strip() if isinstance(resolved.livekit_api_key, str) else None
        )
        livekit_api_secret = (
            resolved.livekit_api_secret.strip()
            if isinstance(resolved.livekit_api_secret, str)
            else None
        )
        if resolved.environment != "prod":
            livekit_url = livekit_url or "ws://127.0.0.1:7880"
            livekit_api_key = livekit_api_key or "devkey"
            livekit_api_secret = livekit_api_secret or "secret"

        object.__setattr__(resolved, "livekit_url", livekit_url)
        object.__setattr__(resolved, "livekit_api_key", livekit_api_key)
        object.__setattr__(resolved, "livekit_api_secret", livekit_api_secret)
        return resolved

    @property
    def database_dsn(self) -> str:
        return (self.database_url or DEFAULT_DATABASE_URL).replace("+psycopg", "")

    @property
    def livekit_configured(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
