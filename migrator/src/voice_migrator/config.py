from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+psycopg://voice:voice@localhost:5432/voice"


class Settings(BaseSettings):
    environment: Literal["dev", "test", "prod"] = Field(
        default="dev",
        validation_alias=AliasChoices("VOICE_ENVIRONMENT"),
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
    admin_email: str = Field(
        default="admin@voice.local",
        validation_alias=AliasChoices("VOICE_DEV_ADMIN_EMAIL"),
    )
    admin_name: str = Field(
        default="Voice Admin",
        validation_alias=AliasChoices("VOICE_DEV_ADMIN_NAME"),
    )
    tenant_name: str = Field(
        default="Voice Demo Tenant",
        validation_alias=AliasChoices("VOICE_DEV_TENANT_NAME"),
    )
    workspace_name: str = Field(
        default="Voice Demo Workspace",
        validation_alias=AliasChoices("VOICE_DEV_WORKSPACE_NAME"),
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
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[3]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
