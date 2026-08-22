import pytest
from httpx import ASGITransport, AsyncClient

from voice_pipeline.app import create_app


@pytest.mark.asyncio
async def test_pipeline_ready_endpoint_lists_supported_modes() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert "stt_llm_tts" in response.json()["supported_pipeline_modes"]
