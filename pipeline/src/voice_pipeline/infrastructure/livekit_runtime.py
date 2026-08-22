from typing import Literal

from pydantic import BaseModel, Field

from voice_pipeline.config import Settings
from voice_pipeline.domain.models import PipelineMode, RuntimePlan

LiveKitStartupMode = Literal["console", "connect", "dispatch"]


class LiveKitRuntimeDescriptor(BaseModel):
    transport: str = "livekit"
    startup_mode: LiveKitStartupMode
    configured: bool
    dispatch_agent_name: str
    room_name: str
    single_participant_room: bool = True
    telephony_enabled: bool
    session_components: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class LiveKitRuntimeValidator:
    def __init__(self, settings: Settings):
        self._settings = settings

    def describe(self, plan: RuntimePlan) -> LiveKitRuntimeDescriptor:
        startup_mode = self._settings.livekit_startup_mode
        missing_fields: list[str] = []

        if startup_mode in {"connect", "dispatch"} and not self._settings.livekit_url:
            missing_fields.append("livekit_url")
        if startup_mode == "dispatch" and not self._settings.livekit_api_key:
            missing_fields.append("livekit_api_key")
        if startup_mode == "dispatch" and not self._settings.livekit_api_secret:
            missing_fields.append("livekit_api_secret")

        session_components = self._session_components_for_mode(plan.blueprint.pipeline_mode)
        notes = [
            "agent handoff stays inside the Voice workflow state machine",
            "telephony transfer remains a separate transport-level action",
        ]
        if self._settings.prefer_server_vad:
            notes.append("server-side VAD is preferred when the selected providers support it")
        if self._settings.allow_interruptions:
            notes.append("interruption handling is enabled in the canonical turn policy")

        return LiveKitRuntimeDescriptor(
            startup_mode=startup_mode,
            configured=not missing_fields and plan.is_valid,
            dispatch_agent_name=self._settings.livekit_agent_name,
            room_name=self._settings.livekit_room_name,
            telephony_enabled=bool(plan.blueprint.provider_selection.telephony_provider_id),
            session_components=session_components,
            missing_fields=missing_fields,
            notes=notes,
        )

    @staticmethod
    def _session_components_for_mode(pipeline_mode: PipelineMode) -> list[str]:
        if pipeline_mode is PipelineMode.REALTIME_S2S:
            return ["realtime-model", "turn-detection", "handoff-policy"]
        if pipeline_mode is PipelineMode.STT_REALTIME:
            return ["stt", "realtime-model", "turn-detection", "handoff-policy"]
        if pipeline_mode is PipelineMode.TEXT_LLM_TTS:
            return ["llm", "tts", "turn-detection", "handoff-policy"]
        return ["stt", "llm", "tts", "turn-detection", "handoff-policy"]

    @staticmethod
    def to_bootstrap_metadata(
        plan: RuntimePlan, descriptor: LiveKitRuntimeDescriptor
    ) -> dict[str, object]:
        selected_providers = {
            provider_kind.value: capability.provider_id
            for provider_kind, capability in plan.selected_providers.items()
        }
        return {
            "startup_mode": descriptor.startup_mode,
            "dispatch_agent_name": descriptor.dispatch_agent_name,
            "room_name": descriptor.room_name,
            "session_components": descriptor.session_components,
            "providers": selected_providers,
            "turn_policy": plan.blueprint.turn_policy.model_dump(mode="json"),
            "handoff_policy": plan.blueprint.handoff_policy.model_dump(mode="json"),
        }
