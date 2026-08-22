from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.infrastructure.livekit_providers import build_provider_bundle


def test_build_provider_bundle_constructs_flux_stack() -> None:
    bundle = build_provider_bundle(
        ClientSessionRequest(
            room={"room_name": "voice-browser-room"},
            stt={"api_key": "dg-key", "model": "flux-general-en", "language": "en-US"},
            llm={"api_key": "oa-key", "model": "gpt-4.1-mini"},
            tts={"api_key": "ca-key", "voice": "cartesia-voice"},
        )
    )

    assert type(bundle.stt).__name__ == "STTv2"
    assert type(bundle.llm).__name__ == "LLM"
    assert type(bundle.tts).__name__ == "TTS"
    assert type(bundle.room_options).__name__ == "RoomOptions"
    assert bundle.turn_handling["turn_detection"] == "stt"
    assert bundle.turn_handling["interruption"]["mode"] == "vad"


def test_build_provider_bundle_constructs_nova_stack() -> None:
    bundle = build_provider_bundle(
        ClientSessionRequest(
            room={"room_name": "voice-browser-room"},
            stt={"api_key": "dg-key", "model": "nova-3", "language": "en-US"},
            llm={"api_key": "oa-key", "model": "gpt-4.1-mini"},
            tts={"api_key": "ca-key", "voice": "cartesia-voice"},
        )
    )

    assert type(bundle.stt).__name__ == "STT"
    assert bundle.turn_handling["interruption"]["mode"] == "vad"
