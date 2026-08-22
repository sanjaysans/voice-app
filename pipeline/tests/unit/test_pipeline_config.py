from voice_pipeline.config import Settings


def test_pipeline_settings_default_to_three_layer_mode() -> None:
    settings = Settings()

    assert settings.pipeline_mode == "stt_llm_tts"


def test_pipeline_settings_allow_livekit_url_override() -> None:
    settings = Settings(livekit_url="ws://localhost:7880")

    assert settings.livekit_url == "ws://localhost:7880"
