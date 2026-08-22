import pytest
from httpx import ASGITransport, AsyncClient

from voice_backend.app import create_app
from voice_backend.database import get_request_session


@pytest.mark.asyncio
async def test_tenant_overview_endpoint_returns_404_for_unknown_tenant(session) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/tenants/missing/overview")

        assert response.status_code == 404
        assert response.json()["detail"] == "tenant not found"


@pytest.mark.asyncio
async def test_tenant_overview_endpoint_returns_counts(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/tenants/voice-demo/overview")

        assert response.status_code == 200
        assert response.json()["workspace_count"] == 2
        assert response.json()["active_call_count"] == 2


@pytest.mark.asyncio
async def test_tenant_crud_endpoints_work(session) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            "/api/v1/tenants",
            json={"slug": "acme", "name": "Acme", "status": "active"},
        )
        get_response = await client.get("/api/v1/tenants/acme")
        update_response = await client.patch("/api/v1/tenants/acme", json={"name": "Acme AI"})
        delete_response = await client.delete("/api/v1/tenants/acme")
        missing_response = await client.get("/api/v1/tenants/acme")

        assert create_response.status_code == 201
        assert get_response.status_code == 200
        assert update_response.status_code == 200
        assert update_response.json()["tenant_name"] == "Acme AI"
        assert delete_response.status_code == 204
        assert missing_response.status_code == 404


@pytest.mark.asyncio
async def test_workspace_agents_endpoint_returns_latest_version_data(
    session, seeded_domain
) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents"
        )

        assert response.status_code == 200
        assert response.json()[0]["latest_pipeline_mode"] == "realtime_s2s"


@pytest.mark.asyncio
async def test_workspace_crud_endpoints_work(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            "/api/v1/tenants/voice-demo/workspaces",
            json={"name": "Growth", "is_default": False},
        )
        workspace_id = create_response.json()["workspace_id"]
        list_response = await client.get("/api/v1/tenants/voice-demo/workspaces")
        update_response = await client.patch(
            f"/api/v1/tenants/voice-demo/workspaces/{workspace_id}",
            json={"is_default": True},
        )
        delete_response = await client.delete(
            f"/api/v1/tenants/voice-demo/workspaces/{workspace_id}"
        )

        assert create_response.status_code == 201
        assert list_response.status_code == 200
        assert any(item["name"] == "Growth" for item in list_response.json())
        assert update_response.status_code == 200
        assert update_response.json()["is_default"] is True
        assert delete_response.status_code == 204


@pytest.mark.asyncio
async def test_deleting_default_workspace_promotes_another_workspace(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.delete(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}"
        )
        list_response = await client.get("/api/v1/tenants/voice-demo/workspaces")

        assert response.status_code == 204
        assert list_response.status_code == 200
        defaults = [item["name"] for item in list_response.json() if item["is_default"]]
        assert defaults == ["Support"]


@pytest.mark.asyncio
async def test_workspace_default_selection_remains_unique(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.patch(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['secondary_workspace'].id}",
            json={"is_default": True},
        )
        list_response = await client.get("/api/v1/tenants/voice-demo/workspaces")

        assert response.status_code == 200
        defaults = [item["name"] for item in list_response.json() if item["is_default"]]
        assert defaults == ["Support"]


@pytest.mark.asyncio
async def test_recent_calls_endpoint_applies_limit(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls/recent?limit=1"
        )

        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_agent_definition_endpoints_create_update_and_version(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents",
            json={
                "agent_key": "qualification-router",
                "name": "Qualification Router",
                "status": "draft",
                "initial_version": {
                    "pipeline_mode": "stt_llm_tts",
                    "routing_config": {"entry": "qualification"},
                    "vendor_config": {"stt": "deepgram"},
                },
            },
        )
        agent_id = create_response.json()["agent_id"]
        get_response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents/{agent_id}"
        )
        update_response = await client.patch(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents/{agent_id}",
            json={"status": "published"},
        )
        version_response = await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/agents/{agent_id}/versions",
            json={
                "pipeline_mode": "realtime_s2s",
                "routing_config": {"entry": "handoff"},
                "vendor_config": {"llm": "openai-realtime"},
            },
        )

        assert create_response.status_code == 201
        assert get_response.status_code == 200
        assert get_response.json()["latest_version"]["version_number"] == 1
        assert len(get_response.json()["versions"]) == 1
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "published"
        assert version_response.status_code == 200
        assert version_response.json()["latest_version"]["version_number"] == 2
        assert version_response.json()["latest_version"]["pipeline_mode"] == "realtime_s2s"
        assert len(version_response.json()["versions"]) == 2


@pytest.mark.asyncio
async def test_provider_account_crud_endpoints_work(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        list_response = await client.get("/api/v1/tenants/voice-demo/provider-accounts")
        create_response = await client.post(
            "/api/v1/tenants/voice-demo/provider-accounts",
            json={
                "provider_kind": "tts",
                "vendor_name": "cartesia",
                "label": "Primary TTS",
                "status": "draft",
                "config": {"voice_id": "amber"},
            },
        )
        provider_account_id = create_response.json()["provider_account_id"]
        update_response = await client.patch(
            f"/api/v1/tenants/voice-demo/provider-accounts/{provider_account_id}",
            json={"status": "active"},
        )
        delete_response = await client.delete(
            f"/api/v1/tenants/voice-demo/provider-accounts/{provider_account_id}"
        )

        assert list_response.status_code == 200
        assert len(list_response.json()) == 1
        assert list_response.json()[0]["config_keys"] == ["api_key_ref"]
        assert "config" not in list_response.json()[0]
        assert create_response.status_code == 201
        assert create_response.json()["has_config"] is True
        assert create_response.json()["config_keys"] == ["voice_id"]
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "active"
        assert delete_response.status_code == 204


@pytest.mark.asyncio
async def test_workspace_app_state_and_team_endpoints_work(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        state_response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/app-state"
        )
        create_member_response = await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/members",
            json={
                "email": "ops@example.com",
                "display_name": "Ops Lead",
                "role": "admin",
            },
        )
        membership_id = create_member_response.json()["membership_id"]
        update_member_response = await client.patch(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/members/{membership_id}",
            json={"display_name": "Ops Manager", "role": "editor"},
        )
        list_members_response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/members"
        )
        delete_member_response = await client.delete(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/members/{membership_id}"
        )

        assert state_response.status_code == 200
        assert len(state_response.json()["agents"]) == 1
        assert len(state_response.json()["calls"]) == 2
        assert create_member_response.status_code == 201
        assert update_member_response.status_code == 200
        assert update_member_response.json()["display_name"] == "Ops Manager"
        assert list_members_response.status_code == 200
        assert len(list_members_response.json()) == 1
        assert delete_member_response.status_code == 204


@pytest.mark.asyncio
async def test_call_review_endpoints_create_update_and_delete(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls",
            json={
                "agent_id": str(seeded_domain["agent"].id),
                "lead_name": "Morgan Hart",
                "company": "Signal Labs",
                "phone": "+15551230000",
                "scenario_name": "Qualification",
                "status": "Completed",
                "duration": "04:22",
                "summary": "Completed qualification and proposed next step.",
                "outcome": "Qualified",
                "next_step": "Notify account executive.",
                "vendor_trace": "Deepgram -> GPT-4.1 -> ElevenLabs",
                "synced_to_crm": False,
            },
        )
        call_id = create_response.json()["call_id"]
        update_response = await client.patch(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls/{call_id}",
            json={"synced_to_crm": True, "next_step": "CRM synced."},
        )
        delete_response = await client.delete(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls/{call_id}"
        )

        assert create_response.status_code == 201
        assert update_response.status_code == 200
        assert update_response.json()["synced_to_crm"] is True
        assert update_response.json()["next_step"] == "CRM synced."
        assert delete_response.status_code == 204


@pytest.mark.asyncio
async def test_workspace_agents_endpoint_returns_404_for_wrong_tenant(
    session, seeded_domain
) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/other-tenant/workspaces/{seeded_domain['workspace'].id}/agents"
        )

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_provider_account_endpoints_return_404_for_wrong_tenant(
    session, seeded_domain
) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/other-tenant/provider-accounts/{seeded_domain['provider_account'].id}"
        )

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_recent_calls_endpoint_returns_404_for_wrong_tenant(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/other-tenant/workspaces/{seeded_domain['workspace'].id}/calls/recent"
        )

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_recent_calls_endpoint_rejects_invalid_limit(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get(
            f"/api/v1/tenants/voice-demo/workspaces/{seeded_domain['workspace'].id}/calls/recent?limit=0"
        )

        assert response.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_tenant_slug_returns_conflict(session) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await client.post("/api/v1/tenants", json={"slug": "acme", "name": "Acme"})
        response = await client.post("/api/v1/tenants", json={"slug": "acme", "name": "Acme 2"})

        assert response.status_code == 409


@pytest.mark.asyncio
async def test_duplicate_provider_account_label_returns_conflict(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/v1/tenants/voice-demo/provider-accounts",
            json={
                "provider_kind": "stt",
                "vendor_name": "assemblyai",
                "label": "Primary STT",
                "status": "draft",
                "config": {"api_key_ref": "secret://assemblyai/primary"},
            },
        )

        assert response.status_code == 409
