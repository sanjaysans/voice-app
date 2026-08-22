import pytest
from httpx import ASGITransport, AsyncClient

from voice_pipeline.app import create_app
from voice_pipeline.config import Settings


@pytest.mark.asyncio
async def test_ready_endpoint_reflects_livekit_configuration() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings(livekit_url="ws://localhost:7880"))),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["runtime"]["configured"] is True


@pytest.mark.asyncio
async def test_ready_endpoint_reports_all_supported_pipeline_modes() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings(pipeline_mode="realtime_s2s"))),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["pipeline_mode"] == "realtime_s2s"
        assert response.json()["supported_pipeline_modes"] == [
            "realtime_s2s",
            "stt_llm_tts",
            "stt_realtime",
            "text_llm_tts",
        ]


@pytest.mark.asyncio
async def test_runtime_plan_endpoint_returns_blueprint_and_runtime() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings())),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runtime/plan")

        payload = response.json()
        assert response.status_code == 200
        assert payload["blueprint"]["root_agent_id"] == "router"
        assert payload["runtime"]["transport"] == "livekit"


@pytest.mark.asyncio
async def test_webrtc_session_endpoint_returns_dispatch_manifest() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings())),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/webrtc/session",
            json={
                "room": {"room_name": "voice-browser-room"},
                "prompt": {
                    "system_prompt": "Act as a helpful voice agent.",
                    "opening_message": "Hello from Voice.",
                },
                "stt": {"api_key": "dg-key", "model": "flux-general-en", "language": "en-US"},
                "llm": {"api_key": "oa-key", "model": "gpt-4.1-mini"},
                "tts": {"api_key": "ca-key", "voice": "cartesia-voice"},
            },
        )

        payload = response.json()
        assert response.status_code == 200
        assert payload["session"]["room_name"] == "voice-browser-room"
        assert payload["session"]["opening_message_configured"] is True
        assert "dispatch_metadata" in payload
