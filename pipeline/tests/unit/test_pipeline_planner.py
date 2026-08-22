from voice_pipeline.application.planner import compile_runtime_plan, default_pipeline_blueprint
from voice_pipeline.config import Settings
from voice_pipeline.domain.models import ProviderCapability, ProviderKind
from voice_pipeline.infrastructure.provider_registry import default_provider_registry


def test_compile_runtime_plan_defaults_to_three_layer_stack() -> None:
    blueprint = default_pipeline_blueprint(Settings())

    plan = compile_runtime_plan(blueprint, default_provider_registry())

    assert plan.is_valid is True
    assert [kind.value for kind in plan.required_provider_kinds] == ["stt", "llm", "tts"]
    assert not plan.errors


def test_compile_runtime_plan_flags_incompatible_provider_mode() -> None:
    settings = Settings(realtime_provider_id="openai-realtime")
    blueprint = default_pipeline_blueprint(
        settings.model_copy(update={"pipeline_mode": "text_llm_tts"})
    )
    registry = default_provider_registry()
    realtime_provider = registry["openai-realtime"]
    registry["openai-responses-llm"] = ProviderCapability(
        provider_id="openai-responses-llm",
        provider_kind=ProviderKind.LLM,
        label=realtime_provider.label,
        supported_modes=realtime_provider.supported_modes,
        supports_streaming_input=realtime_provider.supports_streaming_input,
        supports_streaming_output=realtime_provider.supports_streaming_output,
        supports_partial_transcripts=realtime_provider.supports_partial_transcripts,
        supports_server_vad=realtime_provider.supports_server_vad,
        supports_interruption_recovery=realtime_provider.supports_interruption_recovery,
        supported_modalities=realtime_provider.supported_modalities,
        vendor_limits=realtime_provider.vendor_limits,
    )
    blueprint.provider_selection.llm_provider_id = "openai-responses-llm"

    plan = compile_runtime_plan(blueprint, registry)

    assert plan.is_valid is False
    assert "does not support mode 'text_llm_tts'" in plan.errors[0]


def test_compile_runtime_plan_warns_when_telephony_transfer_lacks_provider() -> None:
    blueprint = default_pipeline_blueprint(
        Settings(telephony_provider_id=None, allow_telephony_transfers=True)
    )

    plan = compile_runtime_plan(blueprint, default_provider_registry())

    assert "telephony transfer is enabled without a telephony provider configured" in plan.warnings


def test_compile_runtime_plan_validates_optional_vad_provider() -> None:
    blueprint = default_pipeline_blueprint(Settings(vad_provider_id="missing-vad"))

    plan = compile_runtime_plan(blueprint, default_provider_registry())

    assert plan.is_valid is False
    assert "provider 'missing-vad' is not registered" in plan.errors
