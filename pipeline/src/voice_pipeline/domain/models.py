from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class PipelineMode(StrEnum):
    REALTIME_S2S = "realtime_s2s"
    STT_LLM_TTS = "stt_llm_tts"
    STT_REALTIME = "stt_realtime"
    TEXT_LLM_TTS = "text_llm_tts"


class ProviderKind(StrEnum):
    TELEPHONY = "telephony"
    STT = "stt"
    LLM = "llm"
    TTS = "tts"
    REALTIME = "realtime"
    VAD = "vad"


class CallState(StrEnum):
    CREATED = "created"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTING = "connecting"
    ACTIVE = "active"
    TRANSFERRING = "transferring"
    WRAPUP = "wrapup"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class ConversationState(StrEnum):
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"
    WAITING_TOOL = "waiting_tool"
    HANDOFF_PENDING = "handoff_pending"
    PAUSED = "paused"


class ProviderCapability(BaseModel):
    provider_id: str
    provider_kind: ProviderKind
    label: str
    supported_modes: list[PipelineMode]
    supports_streaming_input: bool = True
    supports_streaming_output: bool = True
    supports_partial_transcripts: bool = False
    supports_server_vad: bool = False
    supports_interruption_recovery: bool = False
    supported_modalities: list[str] = Field(default_factory=list)
    vendor_limits: dict[str, str | int | float | bool] = Field(default_factory=dict)


class ProviderSelection(BaseModel):
    telephony_provider_id: str | None = "mock-livekit-sip"
    stt_provider_id: str | None = "mock-deepgram"
    llm_provider_id: str | None = "mock-openai-llm"
    tts_provider_id: str | None = "mock-elevenlabs"
    realtime_provider_id: str | None = "mock-openai-realtime"
    vad_provider_id: str | None = "mock-silero"

    def provider_ids_by_kind(self) -> dict[ProviderKind, str]:
        selected_ids: dict[ProviderKind, str] = {}
        mapping = {
            ProviderKind.TELEPHONY: self.telephony_provider_id,
            ProviderKind.STT: self.stt_provider_id,
            ProviderKind.LLM: self.llm_provider_id,
            ProviderKind.TTS: self.tts_provider_id,
            ProviderKind.REALTIME: self.realtime_provider_id,
            ProviderKind.VAD: self.vad_provider_id,
        }
        for provider_kind, provider_id in mapping.items():
            if provider_id:
                selected_ids[provider_kind] = provider_id
        return selected_ids


class TurnPolicy(BaseModel):
    allow_interruptions: bool = True
    prefer_server_vad: bool = True
    endpointing_ms: int = 700
    min_endpointing_ms: int = 300
    max_endpointing_ms: int = 1500
    false_interruption_recovery: bool = True
    interruption_sensitivity: str = "balanced"


class HandoffPolicy(BaseModel):
    allow_agent_handoffs: bool = True
    allow_telephony_transfers: bool = True
    summarize_before_handoff: bool = True
    max_handoffs_per_call: int = 8


class AgentBlueprint(BaseModel):
    agent_id: str
    name: str
    role: str
    prompt_summary: str
    tool_ids: list[str] = Field(default_factory=list)
    kb_binding_ids: list[str] = Field(default_factory=list)
    downstream_agent_ids: list[str] = Field(default_factory=list)
    is_router: bool = False


class PipelineBlueprint(BaseModel):
    blueprint_id: str
    version: str
    pipeline_mode: PipelineMode
    root_agent_id: str
    agents: list[AgentBlueprint]
    provider_selection: ProviderSelection
    turn_policy: TurnPolicy
    handoff_policy: HandoffPolicy
    metadata: dict[str, str | int | float | bool] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_graph(self) -> "PipelineBlueprint":
        known_agent_ids = [agent.agent_id for agent in self.agents]
        if self.root_agent_id not in known_agent_ids:
            raise ValueError(f"root agent '{self.root_agent_id}' is not present in agents")

        if len(known_agent_ids) != len(set(known_agent_ids)):
            raise ValueError("agent ids must be unique within a pipeline blueprint")

        missing_downstream_ids = sorted(
            {
                downstream_agent_id
                for agent in self.agents
                for downstream_agent_id in agent.downstream_agent_ids
                if downstream_agent_id not in known_agent_ids
            }
        )
        if missing_downstream_ids:
            joined_ids = ", ".join(missing_downstream_ids)
            raise ValueError(f"downstream agents are not defined in the blueprint: {joined_ids}")

        return self


class RuntimePlan(BaseModel):
    blueprint: PipelineBlueprint
    required_provider_kinds: list[ProviderKind]
    selected_providers: dict[ProviderKind, ProviderCapability]
    supported_call_states: list[CallState]
    supported_conversation_states: list[ConversationState]
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors
