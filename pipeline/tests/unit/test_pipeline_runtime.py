from voice_pipeline.application.planner import compile_runtime_plan, default_pipeline_blueprint
from voice_pipeline.config import Settings
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.infrastructure.provider_registry import default_provider_registry


def test_livekit_runtime_console_mode_is_ready_without_remote_credentials() -> None:
    settings = Settings()
    plan = compile_runtime_plan(default_pipeline_blueprint(settings), default_provider_registry())

    descriptor = LiveKitRuntimeValidator(settings).describe(plan)

    assert descriptor.configured is True
    assert descriptor.startup_mode == "console"
    assert descriptor.missing_fields == []


def test_livekit_runtime_dispatch_mode_requires_livekit_credentials() -> None:
    settings = Settings(
        livekit_startup_mode="dispatch",
        livekit_url="wss://voice.example.livekit.cloud",
        livekit_api_key="lk-key",
        livekit_api_secret="lk-secret",
    )
    plan = compile_runtime_plan(default_pipeline_blueprint(settings), default_provider_registry())

    descriptor = LiveKitRuntimeValidator(settings).describe(plan)

    assert descriptor.configured is True
    assert descriptor.startup_mode == "dispatch"
    assert descriptor.dispatch_agent_name == "voice-router-agent"


def test_livekit_bootstrap_metadata_contains_selected_components() -> None:
    settings = Settings(pipeline_mode="realtime_s2s")
    plan = compile_runtime_plan(default_pipeline_blueprint(settings), default_provider_registry())
    descriptor = LiveKitRuntimeValidator(settings).describe(plan)

    metadata = LiveKitRuntimeValidator.to_bootstrap_metadata(plan, descriptor)

    assert metadata["session_components"] == ["realtime-model", "turn-detection", "handoff-policy"]
    assert metadata["providers"] == {
        "realtime": "openai-realtime",
        "vad": "silero-vad",
    }
