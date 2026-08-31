from voice_pipeline.config import Settings
from voice_pipeline.domain.models import (
    AgentBlueprint,
    CallState,
    ConversationState,
    HandoffPolicy,
    PipelineBlueprint,
    PipelineMode,
    ProviderCapability,
    ProviderKind,
    ProviderSelection,
    RuntimePlan,
    TurnPolicy,
)

MODE_REQUIREMENTS: dict[PipelineMode, list[ProviderKind]] = {
    PipelineMode.REALTIME_S2S: [ProviderKind.REALTIME],
    PipelineMode.STT_LLM_TTS: [ProviderKind.STT, ProviderKind.LLM, ProviderKind.TTS],
    PipelineMode.STT_REALTIME: [ProviderKind.STT, ProviderKind.REALTIME],
    PipelineMode.TEXT_LLM_TTS: [ProviderKind.LLM, ProviderKind.TTS],
}

SUPPORTED_CALL_STATES = [state for state in CallState]
SUPPORTED_CONVERSATION_STATES = [state for state in ConversationState]


def required_provider_kinds_for_mode(pipeline_mode: PipelineMode) -> list[ProviderKind]:
    return MODE_REQUIREMENTS[pipeline_mode]


def default_pipeline_blueprint(settings: Settings) -> PipelineBlueprint:
    provider_selection = ProviderSelection(
        telephony_provider_id=settings.telephony_provider_id,
        stt_provider_id=settings.stt_provider_id,
        llm_provider_id=settings.llm_provider_id,
        tts_provider_id=settings.tts_provider_id,
        realtime_provider_id=settings.realtime_provider_id,
        vad_provider_id=settings.vad_provider_id,
    )
    agents = [
        AgentBlueprint(
            agent_id="router",
            name="Router",
            role="intent-router",
            prompt_summary=(
                "Understands caller intent, routes to the best specialist, and preserves context."
            ),
            tool_ids=["lookup_context", "route_decision"],
            downstream_agent_ids=["intake", "resolution", "escalation"],
            is_router=True,
        ),
        AgentBlueprint(
            agent_id="intake",
            name="Intake",
            role="specialist",
            prompt_summary=(
                "Captures the caller goal, relevant constraints, and the minimum structured context."
            ),
            tool_ids=["capture_fields", "normalize_summary"],
            kb_binding_ids=["intake-playbook"],
        ),
        AgentBlueprint(
            agent_id="resolution",
            name="Resolution",
            role="specialist",
            prompt_summary=(
                "Handles the main workflow step, resolves questions, and moves toward an outcome."
            ),
            tool_ids=["complete_task", "send_followup"],
            kb_binding_ids=["resolution-playbook"],
        ),
        AgentBlueprint(
            agent_id="escalation",
            name="Escalation",
            role="human-handoff",
            prompt_summary=(
                "Safely escalates when confidence drops, guardrails trigger, or human review is needed."
            ),
            tool_ids=["notify_operator", "create_summary"],
        ),
    ]
    return PipelineBlueprint(
        blueprint_id="voice-default-runtime",
        version="v1",
        pipeline_mode=settings.pipeline_mode,
        root_agent_id="router",
        agents=agents,
        provider_selection=provider_selection,
        turn_policy=TurnPolicy(
            allow_interruptions=settings.allow_interruptions,
            prefer_server_vad=settings.prefer_server_vad,
            endpointing_ms=settings.endpointing_ms,
            min_endpointing_ms=settings.min_endpointing_ms,
            max_endpointing_ms=settings.max_endpointing_ms,
            endpointing_mode=settings.endpointing_mode,
            endpointing_alpha=settings.endpointing_alpha,
            interruption_mode=settings.interruption_mode,
            min_interruption_duration_ms=settings.min_interruption_duration_ms,
            min_interruption_words=settings.min_interruption_words,
            false_interruption_timeout_ms=settings.false_interruption_timeout_ms,
            backchannel_boundary_ms=settings.backchannel_boundary_ms,
            false_interruption_recovery=settings.false_interruption_recovery,
            interruption_sensitivity=settings.interruption_sensitivity,
            preemptive_generation=settings.preemptive_generation,
            preemptive_tts=settings.preemptive_tts,
            preemptive_max_speech_duration_ms=settings.preemptive_max_speech_duration_ms,
            preemptive_max_retries=settings.preemptive_max_retries,
        ),
        handoff_policy=HandoffPolicy(
            allow_agent_handoffs=settings.allow_agent_handoffs,
            allow_telephony_transfers=settings.allow_telephony_transfers,
            summarize_before_handoff=settings.summarize_before_handoff,
            max_handoffs_per_call=settings.max_handoffs_per_call,
        ),
        metadata={
            "tenant_scope": "single-tenant-runtime",
            "transport": "livekit",
            "startup_mode": settings.livekit_startup_mode,
        },
    )


def compile_runtime_plan(
    blueprint: PipelineBlueprint,
    provider_capabilities: dict[str, ProviderCapability],
) -> RuntimePlan:
    errors: list[str] = []
    warnings: list[str] = []
    required_kinds = required_provider_kinds_for_mode(blueprint.pipeline_mode)
    selected_provider_by_kind: dict[ProviderKind, ProviderCapability] = {}
    selected_ids = blueprint.provider_selection.provider_ids_by_kind()
    optional_kinds = [ProviderKind.TELEPHONY, ProviderKind.VAD]

    for required_kind in required_kinds:
        provider_id = selected_ids.get(required_kind)
        if provider_id is None:
            errors.append(f"missing provider for required kind '{required_kind.value}'")
            continue

        provider = provider_capabilities.get(provider_id)
        if provider is None:
            errors.append(f"provider '{provider_id}' is not registered")
            continue

        if provider.provider_kind is not required_kind:
            errors.append(
                f"provider '{provider_id}' is registered as '{provider.provider_kind.value}' "
                f"but selected for '{required_kind.value}'"
            )
            continue

        if blueprint.pipeline_mode not in provider.supported_modes:
            errors.append(
                f"provider '{provider_id}' does not support mode '{blueprint.pipeline_mode.value}'"
            )
            continue

        selected_provider_by_kind[required_kind] = provider

    for optional_kind in optional_kinds:
        provider_id = selected_ids.get(optional_kind)
        if provider_id is None:
            continue

        provider = provider_capabilities.get(provider_id)
        if provider is None:
            errors.append(f"provider '{provider_id}' is not registered")
            continue

        if provider.provider_kind is not optional_kind:
            errors.append(
                f"provider '{provider_id}' is registered as '{provider.provider_kind.value}' "
                f"but selected for '{optional_kind.value}'"
            )
            continue

        selected_provider_by_kind[optional_kind] = provider

    if blueprint.turn_policy.allow_interruptions:
        interruption_supported = any(
            provider.supports_interruption_recovery
            for provider in selected_provider_by_kind.values()
            if provider.provider_kind in {ProviderKind.STT, ProviderKind.TTS, ProviderKind.REALTIME}
        )
        if not interruption_supported:
            warnings.append("selected providers do not advertise interruption recovery support")

    if (
        blueprint.turn_policy.prefer_server_vad
        and blueprint.pipeline_mode is not PipelineMode.TEXT_LLM_TTS
    ):
        vad_capable = any(
            provider.supports_server_vad
            for provider in selected_provider_by_kind.values()
            if provider.provider_kind in {ProviderKind.STT, ProviderKind.REALTIME}
        )
        if not vad_capable:
            warnings.append("server-side VAD is preferred but not available in selected providers")

    if (
        blueprint.handoff_policy.allow_telephony_transfers
        and not blueprint.provider_selection.telephony_provider_id
    ):
        warnings.append("telephony transfer is enabled without a telephony provider configured")
    if (
        blueprint.pipeline_mode is not PipelineMode.TEXT_LLM_TTS
        and blueprint.provider_selection.vad_provider_id is None
    ):
        warnings.append("audio pipeline is configured without an explicit VAD provider")

    return RuntimePlan(
        blueprint=blueprint,
        required_provider_kinds=required_kinds,
        selected_providers=selected_provider_by_kind,
        supported_call_states=SUPPORTED_CALL_STATES,
        supported_conversation_states=SUPPORTED_CONVERSATION_STATES,
        warnings=warnings,
        errors=errors,
    )
