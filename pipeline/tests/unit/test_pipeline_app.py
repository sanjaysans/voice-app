import pytest
from httpx import ASGITransport, AsyncClient

from voice_pipeline.app import SUPPORTED_PIPELINE_MODES, create_app
from voice_pipeline.config import Settings


@pytest.mark.asyncio
async def test_ready_endpoint_reflects_livekit_configuration() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings(livekit_url="ws://localhost:7880"))),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["livekit_configured"] is True


@pytest.mark.asyncio
async def test_ready_endpoint_reports_all_supported_pipeline_modes() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings(pipeline_mode="realtime_s2s"))),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["pipeline_mode"] == "realtime_s2s"
        assert response.json()["supported_pipeline_modes"] == SUPPORTED_PIPELINE_MODES
