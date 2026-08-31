import pytest
from httpx import ASGITransport, AsyncClient

from voice_jobs.app import create_app


@pytest.mark.asyncio
async def test_jobs_ready_endpoint_lists_workflows() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 503
        assert response.json()["registered_workflows"] == []
        assert response.json()["status"] == "degraded"
