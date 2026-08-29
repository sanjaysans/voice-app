from __future__ import annotations

import json
from typing import Literal, Self
from uuid import uuid4

from pydantic import BaseModel, Field, SecretStr, model_validator

from voice_pipeline.domain.models import PipelineMode, ProviderSelection


class PromptConfig(BaseModel):
    system_prompt: str = Field(
        default=(
            "You are a helpful voice agent. Listen carefully, respond clearly, "
            "and confirm important details before closing the conversation."
        )
    )
    opening_message: str | None = None


class WebRtcRoomConfig(BaseModel):
    room_name: str = Field(default_factory=lambda: f"voice-room-{uuid4().hex[:12]}")
    participant_identity: str | None = None
    text_input_enabled: bool = True
    audio_input_enabled: bool = True
    audio_output_enabled: bool = True
    text_output_enabled: bool = True
    sync_transcription: bool = True
    auto_gain_control: bool = True
    pre_connect_audio: bool = True
    close_on_disconnect: bool = True
    delete_room_on_close: bool = False


class DeepgramSttConfig(BaseModel):
    api_key: SecretStr
    model: str = "flux-general-en"
    language: str = "en-US"
    detect_language: bool = False
    interim_results: bool = True
    punctuate: bool = True
    smart_format: bool = True
    endpointing_ms: int = 25
    utterance_end_ms: int | None = None
    eager_eot_threshold: float | None = 0.4
    eot_threshold: float | None = None
    keywords: list[str] = Field(default_factory=list)
    keyterms: list[str] = Field(default_factory=list)
    enable_diarization: bool = False

    @property
    def uses_flux(self) -> bool:
        return self.model.startswith("flux")


class OpenAiLlmConfig(BaseModel):
    api_key: SecretStr
    model: str = "gpt-4.1-mini"
    temperature: float = 0.2
    max_output_tokens: int | None = 500
    base_url: str | None = None
    user: str | None = None


class CartesiaTtsConfig(BaseModel):
    api_key: SecretStr
    model: str = "sonic-3"
    voice: str = "f786b574-daa5-4673-aa0c-cbe3e8534c02"
    language: str = "en"
    speed: float | None = None
    emotion: str | list[str] | None = None
    volume: float | None = None
    sample_rate: int = 24000


class SileroVadConfig(BaseModel):
    min_speech_duration: float = 0.05
    min_silence_duration: float = 0.55
    prefix_padding_duration: float = 0.5
    max_buffered_speech: float = 60.0
    activation_threshold: float = 0.5
    sample_rate: Literal[8000, 16000] = 16000


class ClientSessionRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: uuid4().hex)
    transport: Literal["webrtc"] = "webrtc"
    pipeline_mode: PipelineMode = PipelineMode.STT_LLM_TTS
    dispatch_agent_name: str = "voice-router-agent"
    provider_selection: ProviderSelection = Field(
        default_factory=lambda: ProviderSelection(
            telephony_provider_id=None,
            stt_provider_id="deepgram-stt",
            llm_provider_id="openai-responses-llm",
            tts_provider_id="cartesia-tts",
            realtime_provider_id="openai-realtime",
            vad_provider_id="silero-vad",
        )
    )
    prompt: PromptConfig = Field(default_factory=PromptConfig)
    room: WebRtcRoomConfig = Field(default_factory=WebRtcRoomConfig)
    stt: DeepgramSttConfig
    llm: OpenAiLlmConfig
    tts: CartesiaTtsConfig
    vad: SileroVadConfig = Field(default_factory=SileroVadConfig)
    variables: dict[str, object] = Field(default_factory=dict)
    workflow: dict[str, object] = Field(default_factory=dict)
    metadata: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_supported_mode(self) -> Self:
        if self.pipeline_mode is not PipelineMode.STT_LLM_TTS:
            raise ValueError("the initial browser flow currently supports only stt_llm_tts")
        return self

    def to_worker_payload(self) -> dict[str, object]:
        payload = self.model_dump(mode="python")
        payload["pipeline_mode"] = self.pipeline_mode.value
        payload["stt"]["api_key"] = self.stt.api_key.get_secret_value()
        payload["llm"]["api_key"] = self.llm.api_key.get_secret_value()
        payload["tts"]["api_key"] = self.tts.api_key.get_secret_value()
        return payload

    def to_worker_metadata(self) -> str:
        return json.dumps(self.to_worker_payload())

    def sanitized_summary(self) -> dict[str, object]:
        return {
            "session_id": self.session_id,
            "transport": self.transport,
            "pipeline_mode": self.pipeline_mode.value,
            "dispatch_agent_name": self.dispatch_agent_name,
            "room_name": self.room.room_name,
            "participant_identity": self.room.participant_identity,
            "provider_selection": self.provider_selection.model_dump(mode="json"),
            "stt": {
                "model": self.stt.model,
                "language": self.stt.language,
                "detect_language": self.stt.detect_language,
            },
            "llm": {
                "model": self.llm.model,
                "temperature": self.llm.temperature,
                "max_output_tokens": self.llm.max_output_tokens,
            },
            "tts": {
                "model": self.tts.model,
                "voice": self.tts.voice,
                "language": self.tts.language,
                "speed": self.tts.speed,
            },
            "vad": self.vad.model_dump(mode="json"),
            "opening_message_configured": bool(self.prompt.opening_message),
            "variable_keys": sorted(self.variables),
            "workflow_node_count": len(self.workflow.get("nodes", []))
            if isinstance(self.workflow.get("nodes"), list)
            else 0,
        }
