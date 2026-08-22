from voice_backend.services import AgentCatalogService, CallHistoryService, TenantOverviewService


def test_tenant_overview_service_returns_workspace_agent_and_call_counts(session, seeded_domain) -> None:
    overview = TenantOverviewService(session).get_by_slug("voice-demo")

    assert overview is not None
    assert overview.workspace_count == 2
    assert overview.agent_count == 2
    assert overview.active_call_count == 2
    assert overview.total_call_count == 3


def test_tenant_overview_service_returns_none_for_missing_tenant(session) -> None:
    overview = TenantOverviewService(session).get_by_slug("missing")

    assert overview is None


def test_agent_catalog_service_uses_latest_version_data(session, seeded_domain) -> None:
    agents = AgentCatalogService(session).list_workspace_agents("voice-demo", seeded_domain["workspace"].id)

    assert agents is not None
    assert len(agents) == 1
    assert agents[0].latest_version_number == 2
    assert agents[0].latest_pipeline_mode == "realtime_s2s"


def test_call_history_service_returns_recent_calls_with_agent_name(session, seeded_domain) -> None:
    calls = CallHistoryService(session).list_recent_calls("voice-demo", seeded_domain["workspace"].id)

    assert calls is not None
    assert [call.status for call in calls] == ["in_progress", "completed"]
    assert calls[0].agent_name == "Lead Router"
    assert calls[0].to_number == "+15550102"


def test_agent_catalog_service_returns_none_for_workspace_outside_tenant(session, seeded_domain) -> None:
    agents = AgentCatalogService(session).list_workspace_agents("other-tenant", seeded_domain["workspace"].id)

    assert agents is None


def test_call_history_service_returns_none_for_workspace_outside_tenant(session, seeded_domain) -> None:
    calls = CallHistoryService(session).list_recent_calls("other-tenant", seeded_domain["workspace"].id)

    assert calls is None
