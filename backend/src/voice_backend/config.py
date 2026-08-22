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
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        validation_alias=AliasChoices("VOICE_BACKEND_CORS_ORIGINS"),
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
            return self

        database_urls = {
            "dev": self.database_url_dev or DEFAULT_DATABASE_URL,
            "test": self.database_url_test or self.database_url_dev or DEFAULT_DATABASE_URL,
            "prod": self.database_url_prod,
        }
        selected_database_url = database_urls[self.environment]
        if selected_database_url is None:
            raise ValueError(f"database URL for environment '{self.environment}' is not configured")
        object.__setattr__(self, "database_url", selected_database_url)
        return self

    @property
    def database_dsn(self) -> str:
        return (self.database_url or DEFAULT_DATABASE_URL).replace("+psycopg", "")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
