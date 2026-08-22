from voice_pipeline.config import Settings
from voice_pipeline.interfaces.livekit.worker import (
    build_worker_bootstrap,
    build_worker_options_kwargs,
)


def test_worker_bootstrap_surfaces_default_browser_providers() -> None:
    bootstrap = build_worker_bootstrap(Settings())

    assert bootstrap["bootstrap"]["providers"]["stt"] == "deepgram-stt"
    assert bootstrap["bootstrap"]["providers"]["llm"] == "openai-responses-llm"
    assert bootstrap["bootstrap"]["providers"]["tts"] == "cartesia-tts"
    assert bootstrap["bootstrap"]["providers"]["vad"] == "silero-vad"


def test_worker_options_include_livekit_connection_settings() -> None:
    options = build_worker_options_kwargs(
        Settings(
            livekit_startup_mode="dispatch",
            livekit_url="wss://voice.example.livekit.cloud",
            livekit_api_key="lk-key",
            livekit_api_secret="lk-secret",
            livekit_agent_name="voice-test-agent",
            log_level="DEBUG",
        )
    )

    assert options == {
        "agent_name": "voice-test-agent",
        "ws_url": "wss://voice.example.livekit.cloud",
        "api_key": "lk-key",
        "api_secret": "lk-secret",
        "log_level": "DEBUG",
    }
