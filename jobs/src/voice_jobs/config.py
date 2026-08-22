from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "voice-jobs"
    host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("VOICE_JOBS_HOST"))
    port: int = Field(default=8102, validation_alias=AliasChoices("VOICE_JOBS_PORT"))
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("VOICE_LOG_LEVEL"))
    temporal_target: str = Field(default="localhost:7233", validation_alias=AliasChoices("VOICE_TEMPORAL_TARGET"))
    temporal_namespace: str = Field(
        default="default",
        validation_alias=AliasChoices("VOICE_TEMPORAL_NAMESPACE"),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
