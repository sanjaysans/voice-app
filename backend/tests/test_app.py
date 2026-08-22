import pytest
from httpx import ASGITransport, AsyncClient

from voice_backend.app import create_app
from voice_backend.config import Settings


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok() -> None:
    app = create_app(Settings(database_url="postgresql+psycopg://voice:voice@localhost:5432/voice"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"
