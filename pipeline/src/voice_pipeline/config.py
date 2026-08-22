from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "voice-pipeline"
    host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("VOICE_PIPELINE_HOST"))
    port: int = Field(default=8101, validation_alias=AliasChoices("VOICE_PIPELINE_PORT"))
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("VOICE_LOG_LEVEL"))
    pipeline_mode: str = "stt_llm_tts"
    livekit_url: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
