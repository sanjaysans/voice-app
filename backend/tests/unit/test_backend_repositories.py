from voice_backend.models import AgentDefinition
from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    ProviderAccountRepository,
    TenantRepository,
    WorkspaceRepository,
)


def test_tenant_repository_creates_and_reads_by_slug(session) -> None:
    repository = TenantRepository(session)
    created = repository.create(slug="acme", name="Acme")
    session.commit()

    loaded = repository.get_by_slug("acme")

    assert loaded is not None
    assert loaded.id == created.id
    assert loaded.name == "Acme"


def test_workspace_repository_lists_workspaces_for_tenant(session, seeded_domain) -> None:
    repository = WorkspaceRepository(session)

    workspaces = repository.list_by_tenant(seeded_domain["tenant"].id)

    assert [workspace.name for workspace in workspaces] == ["Sales", "Support"]


def test_workspace_repository_updates_workspace(session, seeded_domain) -> None:
    repository = WorkspaceRepository(session)

    updated = repository.update(seeded_domain["workspace"], name="Growth", is_default=False)

    assert updated.name == "Growth"
    assert updated.is_default is False


def test_workspace_repository_clears_other_defaults(session, seeded_domain) -> None:
    repository = WorkspaceRepository(session)

    repository.update(seeded_domain["secondary_workspace"], is_default=True)
    repository.clear_default_for_tenant(
        seeded_domain["tenant"].id,
        except_workspace_id=seeded_domain["secondary_workspace"].id,
    )

    assert seeded_domain["workspace"].is_default is False
    assert seeded_domain["secondary_workspace"].is_default is True


def test_agent_repository_returns_latest_version(session, seeded_domain) -> None:
    repository = AgentRepository(session)

    version = repository.latest_version_for(seeded_domain["agent"].id)

    assert version is not None
    assert version.version_number == 2
    assert version.pipeline_mode == "realtime_s2s"


def test_agent_repository_gets_definition_for_workspace(session, seeded_domain) -> None:
    repository = AgentRepository(session)

    agent = repository.get_definition_for_workspace(
        seeded_domain["tenant"].id,
        seeded_domain["workspace"].id,
        seeded_domain["agent"].id,
    )

    assert agent is not None
    assert agent.id == seeded_domain["agent"].id


def test_agent_repository_lists_workspace_agents(session, seeded_domain) -> None:
    repository = AgentRepository(session)

    agents = repository.list_by_workspace(seeded_domain["tenant"].id, seeded_domain["workspace"].id)

    assert [agent.name for agent in agents] == ["Lead Router"]
    assert isinstance(agents[0], AgentDefinition)


def test_agent_repository_scopes_workspace_queries_by_tenant(session, seeded_domain) -> None:
    repository = AgentRepository(session)

    agents = repository.list_by_workspace(
        seeded_domain["foreign_tenant"].id, seeded_domain["workspace"].id
    )

    assert agents == []


def test_agent_repository_updates_definition(session, seeded_domain) -> None:
    repository = AgentRepository(session)

    updated = repository.update_definition(seeded_domain["agent"], name="Closer", status="archived")

    assert updated.name == "Closer"
    assert updated.status == "archived"


def test_call_repository_lists_recent_calls_in_descending_order(session, seeded_domain) -> None:
    repository = CallRepository(session)

    calls = repository.list_recent_by_workspace(
        seeded_domain["tenant"].id,
        seeded_domain["workspace"].id,
    )

    assert [call.status for call in calls] == ["in_progress", "completed"]


def test_call_repository_updates_status_when_call_exists(session, seeded_domain) -> None:
    repository = CallRepository(session)

    updated = repository.update_status(
        seeded_domain["tenant"].id, seeded_domain["first_call"].id, "dropped"
    )
    session.commit()

    assert updated is not None
    assert updated.status == "dropped"


def test_call_repository_returns_none_for_missing_call(session) -> None:
    repository = CallRepository(session)

    updated = repository.update_status("missing-tenant-id", "missing-call-id", "completed")

    assert updated is None


def test_call_repository_does_not_update_other_tenant_call(session, seeded_domain) -> None:
    repository = CallRepository(session)

    updated = repository.update_status(
        seeded_domain["foreign_tenant"].id,
        seeded_domain["first_call"].id,
        "dropped",
    )

    assert updated is None


def test_provider_account_repository_lists_and_updates_accounts(session, seeded_domain) -> None:
    repository = ProviderAccountRepository(session)

    accounts = repository.list_by_tenant(seeded_domain["tenant"].id)
    updated = repository.update(
        seeded_domain["provider_account"],
        vendor_name="assemblyai",
        config={"api_key_ref": "secret://assemblyai/primary"},
    )

    assert len(accounts) == 1
    assert accounts[0].label == "Primary STT"
    assert updated.vendor_name == "assemblyai"
    assert updated.config["api_key_ref"] == "secret://assemblyai/primary"
