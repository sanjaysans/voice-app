import pytest
from httpx import ASGITransport, AsyncClient

from voice_backend.app import create_app
from voice_backend.database import get_request_session


@pytest.mark.asyncio
async def test_tenant_overview_endpoint_returns_404_for_unknown_tenant(session) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/v1/tenants/missing/overview")

        assert response.status_code == 404
        assert response.json()["detail"] == "tenant not found"


@pytest.mark.asyncio
async def test_tenant_overview_endpoint_returns_counts(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/v1/tenants/voice-demo/overview")

        assert response.status_code == 200
        assert response.json()["workspace_count"] == 2
        assert response.json()["active_call_count"] == 2


@pytest.mark.asyncio
async def test_workspace_agents_endpoint_returns_latest_version_data(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents"
        )

        assert response.status_code == 200
        assert response.json()[0]["latest_pipeline_mode"] == "realtime_s2s"


@pytest.mark.asyncio
async def test_recent_calls_endpoint_applies_limit(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls/recent?limit=1"
        )

        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_workspace_agents_endpoint_returns_404_for_wrong_tenant(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get(
            f"/api/v1/tenants/other-tenant/workspaces/{seeded_domain['workspace'].id}/agents"
        )

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_recent_calls_endpoint_returns_404_for_wrong_tenant(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get(
            f"/api/v1/tenants/other-tenant/workspaces/{seeded_domain['workspace'].id}/calls/recent"
        )

        assert response.status_code == 404
