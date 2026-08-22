import pytest
from httpx import ASGITransport, AsyncClient

from voice_jobs.app import REGISTERED_WORKFLOWS, create_app
from voice_jobs.config import Settings


@pytest.mark.asyncio
async def test_ready_endpoint_reports_temporal_connection_settings() -> None:
    async with AsyncClient(
        transport=ASGITransport(
            app=create_app(
                Settings(temporal_target="temporal.local:7233", temporal_namespace="voice-dev")
            )
        ),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["temporal_target"] == "temporal.local:7233"
        assert response.json()["temporal_namespace"] == "voice-dev"


@pytest.mark.asyncio
async def test_ready_endpoint_lists_registered_workflows() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings())),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["registered_workflows"] == REGISTERED_WORKFLOWS
