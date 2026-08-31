import pytest

from voice_pipeline.config import Settings


def test_pipeline_settings_default_to_three_layer_mode() -> None:
    settings = Settings()

    assert settings.pipeline_mode.value == "stt_llm_tts"


def test_pipeline_settings_allow_livekit_url_override() -> None:
    settings = Settings(livekit_url="ws://localhost:7880")

    assert settings.livekit_url == "ws://localhost:7880"


def test_pipeline_settings_default_to_console_startup_mode() -> None:
    settings = Settings()

    assert settings.livekit_startup_mode == "console"


def test_pipeline_settings_require_url_for_dispatch_mode() -> None:
    with pytest.raises(ValueError, match="VOICE_LIVEKIT_URL"):
        Settings(
            livekit_startup_mode="dispatch",
            livekit_url=None,
            livekit_api_key=None,
            livekit_api_secret=None,
        )


def test_pipeline_settings_validate_endpointing_range() -> None:
    with pytest.raises(ValueError, match="MIN_ENDPOINTING_MS"):
        Settings(endpointing_mode="fixed", min_endpointing_ms=900, endpointing_ms=700)


def test_pipeline_settings_allow_dynamic_endpointing_without_fixed_target() -> None:
    settings = Settings(
        endpointing_mode="dynamic",
        min_endpointing_ms=900,
        max_endpointing_ms=1200,
        endpointing_ms=700,
    )

    assert settings.min_endpointing_ms == 900


def test_pipeline_settings_reject_blank_dispatch_credentials() -> None:
    with pytest.raises(ValueError, match="VOICE_LIVEKIT_URL"):
        Settings(
            livekit_startup_mode="dispatch",
            livekit_url="",
            livekit_api_key="",
            livekit_api_secret="",
        )


def test_pipeline_settings_reject_negative_endpointing_values() -> None:
    with pytest.raises(ValueError):
        Settings(endpointing_ms=-1)
