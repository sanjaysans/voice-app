import uuid

from voice_migrator.seed import (
    build_default_provider_rows,
    build_demo_agents,
    build_demo_calls,
    build_demo_connection_rows,
    tenant_slug_from_name,
)


def test_tenant_slug_from_name_trims_spaces_and_normalizes_case() -> None:
    assert tenant_slug_from_name("  Voice Demo Tenant  ") == "voice-demo-tenant"


def test_build_default_provider_rows_creates_one_row_per_provider_kind() -> None:
    tenant_id = uuid.uuid4()

    rows = build_default_provider_rows(tenant_id)

    assert len(rows) == 4
    assert {row["provider_kind"] for row in rows} == {"stt", "llm", "tts", "telephony"}
    assert all(row["tenant_id"] == tenant_id for row in rows)
    assert all(row["config"] == {"mode": "local"} for row in rows)


def test_build_demo_connection_rows_creates_operator_facing_categories() -> None:
    tenant_id = uuid.uuid4()

    rows = build_demo_connection_rows(tenant_id)

    assert {row["provider_kind"] for row in rows} == {"crm", "calendar", "knowledge"}


def test_build_demo_agents_and_calls_stay_consistent() -> None:
    tenant_id = uuid.uuid4()
    workspace_id = uuid.uuid4()

    agents = build_demo_agents(tenant_id, workspace_id)
    calls = build_demo_calls(tenant_id, workspace_id, agents)

    assert len(agents) == 2
    assert len(calls) == 2
    assert {call["agent_version_id"] for call in calls} == {
        agents[0]["version"]["id"],
        agents[1]["version"]["id"],
    }
