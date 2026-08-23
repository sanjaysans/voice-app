from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from voice_pipeline.domain.models import PipelineMode


class Settings(BaseSettings):
    service_name: str = "voice-pipeline"
    environment: Literal["dev", "test", "prod"] = Field(
        default="dev",
        validation_alias=AliasChoices("VOICE_ENVIRONMENT"),
    )
    host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("VOICE_PIPELINE_HOST"))
    port: int = Field(default=8101, validation_alias=AliasChoices("VOICE_PIPELINE_PORT"))
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("VOICE_LOG_LEVEL"))
    secret_encryption_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_SECRET_ENCRYPTION_KEY"),
    )
    pipeline_mode: PipelineMode = Field(
        default=PipelineMode.STT_LLM_TTS,
        validation_alias=AliasChoices("VOICE_PIPELINE_MODE"),
    )
    livekit_startup_mode: Literal["console", "connect", "dispatch"] = Field(
        default="console",
        validation_alias=AliasChoices("VOICE_LIVEKIT_STARTUP_MODE"),
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
    livekit_room_name: str = Field(
        default="voice-local-room",
        validation_alias=AliasChoices("VOICE_LIVEKIT_ROOM_NAME"),
    )
    telephony_provider_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VOICE_TELEPHONY_PROVIDER_ID"),
    )
    stt_provider_id: str | None = Field(
        default="deepgram-stt",
        validation_alias=AliasChoices("VOICE_STT_PROVIDER_ID"),
    )
    llm_provider_id: str | None = Field(
        default="openai-responses-llm",
        validation_alias=AliasChoices("VOICE_LLM_PROVIDER_ID"),
    )
    tts_provider_id: str | None = Field(
        default="cartesia-tts",
        validation_alias=AliasChoices("VOICE_TTS_PROVIDER_ID"),
    )
    realtime_provider_id: str | None = Field(
        default="openai-realtime",
        validation_alias=AliasChoices("VOICE_REALTIME_PROVIDER_ID"),
    )
    vad_provider_id: str | None = Field(
        default="silero-vad",
        validation_alias=AliasChoices("VOICE_VAD_PROVIDER_ID"),
    )
    allow_interruptions: bool = Field(
        default=True,
        validation_alias=AliasChoices("VOICE_PIPELINE_ALLOW_INTERRUPTIONS"),
    )
    prefer_server_vad: bool = Field(
        default=True,
        validation_alias=AliasChoices("VOICE_PIPELINE_PREFER_SERVER_VAD"),
    )
    endpointing_ms: int = Field(
        default=700,
        validation_alias=AliasChoices("VOICE_PIPELINE_ENDPOINTING_MS"),
    )
    min_endpointing_ms: int = Field(
        default=300,
        validation_alias=AliasChoices("VOICE_PIPELINE_MIN_ENDPOINTING_MS"),
    )
    max_endpointing_ms: int = Field(
        default=1500,
        validation_alias=AliasChoices("VOICE_PIPELINE_MAX_ENDPOINTING_MS"),
    )
    false_interruption_recovery: bool = Field(
        default=True,
        validation_alias=AliasChoices("VOICE_PIPELINE_FALSE_INTERRUPTION_RECOVERY"),
    )
    interruption_sensitivity: str = Field(
        default="balanced",
        validation_alias=AliasChoices("VOICE_PIPELINE_INTERRUPTION_SENSITIVITY"),
    )
    allow_agent_handoffs: bool = Field(
        default=True,
        validation_alias=AliasChoices("VOICE_PIPELINE_ALLOW_AGENT_HANDOFFS"),
    )
    allow_telephony_transfers: bool = Field(
        default=False,
        validation_alias=AliasChoices("VOICE_PIPELINE_ALLOW_TELEPHONY_TRANSFERS"),
    )
    summarize_before_handoff: bool = Field(
        default=True,
        validation_alias=AliasChoices("VOICE_PIPELINE_SUMMARIZE_BEFORE_HANDOFF"),
    )
    max_handoffs_per_call: int = Field(
        default=8,
        validation_alias=AliasChoices("VOICE_PIPELINE_MAX_HANDOFFS_PER_CALL"),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @model_validator(mode="after")
    def validate_runtime_configuration(self) -> "Settings":
        normalized_fields = {
            "livekit_url": self.livekit_url,
            "livekit_api_key": self.livekit_api_key,
            "livekit_api_secret": self.livekit_api_secret,
            "livekit_agent_name": self.livekit_agent_name,
        }
        for field_name, value in normalized_fields.items():
            if isinstance(value, str) and not value.strip():
                object.__setattr__(
                    self,
                    field_name,
                    None if field_name != "livekit_agent_name" else "voice-router-agent",
                )
        if self.secret_encryption_key is None:
            if self.environment == "prod":
                raise ValueError("VOICE_SECRET_ENCRYPTION_KEY must be configured for production")
            object.__setattr__(self, "secret_encryption_key", "voice-local-dev-encryption-key")

        if self.min_endpointing_ms > self.endpointing_ms:
            raise ValueError("VOICE_PIPELINE_MIN_ENDPOINTING_MS cannot exceed endpointing_ms")
        if self.endpointing_ms > self.max_endpointing_ms:
            raise ValueError("VOICE_PIPELINE_ENDPOINTING_MS cannot exceed max_endpointing_ms")
        if self.livekit_startup_mode in {"connect", "dispatch"} and self.livekit_url is None:
            raise ValueError("VOICE_LIVEKIT_URL must be configured for connect or dispatch mode")
        if self.livekit_startup_mode == "dispatch":
            if self.livekit_api_key is None:
                raise ValueError("VOICE_LIVEKIT_API_KEY must be configured for dispatch mode")
            if self.livekit_api_secret is None:
                raise ValueError("VOICE_LIVEKIT_API_SECRET must be configured for dispatch mode")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
