import json

from voice_pipeline.application.session_manifest import (
    build_runtime_plan_for_client_session,
    build_session_manifest,
    parse_session_request_metadata,
)
from voice_pipeline.config import Settings
from voice_pipeline.domain.session import ClientSessionRequest


def _session_request() -> ClientSessionRequest:
    return ClientSessionRequest(
        room={"room_name": "voice-browser-room"},
        prompt={
            "system_prompt": "Help the caller and summarize key information before ending.",
            "opening_message": "Hello, this is Voice. How can I help today?",
        },
        stt={"api_key": "dg-key", "model": "flux-general-en", "language": "en-US"},
        llm={"api_key": "oa-key", "model": "gpt-4.1-mini"},
        tts={"api_key": "ca-key", "voice": "cartesia-voice"},
    )


def test_build_session_manifest_returns_dispatch_metadata() -> None:
    manifest = build_session_manifest(Settings(), _session_request())

    assert manifest["session"]["room_name"] == "voice-browser-room"
    assert manifest["dispatch_agent_name"] == "voice-router-agent"
    assert manifest["runtime"]["transport"] == "livekit"
    assert json.loads(manifest["dispatch_metadata"])["stt"]["api_key"] == "dg-key"


def test_parse_session_request_metadata_round_trips_secrets() -> None:
    session_request = _session_request()

    parsed = parse_session_request_metadata(session_request.to_worker_metadata())

    assert parsed.llm.api_key.get_secret_value() == "oa-key"
    assert parsed.tts.voice == "cartesia-voice"


def test_build_runtime_plan_for_client_session_uses_browser_provider_selection() -> None:
    plan = build_runtime_plan_for_client_session(Settings(), _session_request())

    assert plan.is_valid is True
    assert plan.selected_providers.keys()
