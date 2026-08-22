from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionUpdateInput,
    AgentVersionCreateInput,
    CallReviewCreateInput,
    CallReviewUpdateInput,
    ProviderAccountCreateInput,
    ProviderAccountUpdateInput,
    TeamMemberCreateInput,
    TeamMemberUpdateInput,
    TenantCreateInput,
    TenantUpdateInput,
    WorkspaceCreateInput,
    WorkspaceUpdateInput,
)
from voice_backend.services import (
    AgentCatalogService,
    AgentDefinitionAdminService,
    CallHistoryService,
    CallReviewService,
    ProviderAccountAdminService,
    TeamAdminService,
    TenantAdminService,
    TenantOverviewService,
    WorkspaceAdminService,
    WorkspaceStateService,
)


def test_tenant_overview_service_returns_workspace_agent_and_call_counts(
    session, seeded_domain
) -> None:
    overview = TenantOverviewService(session).get_by_slug("voice-demo")

    assert overview is not None
    assert overview.workspace_count == 2
    assert overview.agent_count == 2
    assert overview.active_call_count == 2
    assert overview.total_call_count == 3


def test_tenant_overview_service_returns_none_for_missing_tenant(session) -> None:
    overview = TenantOverviewService(session).get_by_slug("missing")

    assert overview is None


def test_tenant_admin_service_creates_and_updates_tenant(session) -> None:
    service = TenantAdminService(session)

    created = service.create_tenant(TenantCreateInput(slug="acme", name="Acme"))
    updated = service.update_tenant("acme", TenantUpdateInput(name="Acme AI", status="paused"))

    assert created.tenant_slug == "acme"
    assert updated is not None
    assert updated.tenant_name == "Acme AI"
    assert updated.status == "paused"


def test_agent_catalog_service_uses_latest_version_data(session, seeded_domain) -> None:
    agents = AgentCatalogService(session).list_workspace_agents(
        "voice-demo", seeded_domain["workspace"].id
    )

    assert agents is not None
    assert len(agents) == 1
    assert agents[0].latest_version_number == 2
    assert agents[0].latest_pipeline_mode == "realtime_s2s"


def test_workspace_admin_service_scopes_and_updates_workspace(session, seeded_domain) -> None:
    service = WorkspaceAdminService(session)

    workspaces = service.list_workspaces("voice-demo")
    updated = service.update_workspace(
        "voice-demo",
        seeded_domain["workspace"].id,
        WorkspaceUpdateInput(name="Growth", is_default=False),
    )

    assert workspaces is not None
    assert len(workspaces) == 2
    assert updated is not None
    assert updated.name == "Growth"
    assert updated.is_default is False


def test_workspace_admin_service_keeps_a_single_default_workspace(session, seeded_domain) -> None:
    service = WorkspaceAdminService(session)

    updated = service.update_workspace(
        "voice-demo",
        seeded_domain["secondary_workspace"].id,
        WorkspaceUpdateInput(is_default=True),
    )
    workspaces = service.list_workspaces("voice-demo")

    assert updated is not None
    assert workspaces is not None
    defaults = [workspace.name for workspace in workspaces if workspace.is_default]
    assert defaults == ["Support"]


def test_call_history_service_returns_recent_calls_with_agent_name(session, seeded_domain) -> None:
    calls = CallHistoryService(session).list_recent_calls(
        "voice-demo", seeded_domain["workspace"].id
    )

    assert calls is not None
    assert [call.status for call in calls] == ["in_progress", "completed"]
    assert calls[0].agent_name == "Lead Router"
    assert calls[0].to_number == "+15550102"


def test_provider_account_admin_service_updates_existing_account(session, seeded_domain) -> None:
    service = ProviderAccountAdminService(session)

    created = service.create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="tts",
            vendor_name="cartesia",
            label="Primary TTS",
            status="draft",
            config={"voice_id": "amber"},
        ),
    )
    updated = service.update_account(
        "voice-demo",
        seeded_domain["provider_account"].id,
        ProviderAccountUpdateInput(status="inactive"),
    )

    assert created is not None
    assert created.provider_kind == "tts"
    assert created.config_keys == ["voice_id"]
    assert updated is not None
    assert updated.status == "inactive"
    assert updated.has_config is True


def test_agent_definition_admin_service_creates_and_versions_agent(session, seeded_domain) -> None:
    service = AgentDefinitionAdminService(session)

    created = service.create_agent(
        "voice-demo",
        seeded_domain["workspace"].id,
        AgentDefinitionCreateInput(
            agent_key="qualification-router",
            name="Qualification Router",
            status="draft",
            initial_version=AgentVersionCreateInput(
                pipeline_mode="stt_llm_tts",
                routing_config={"entry": "qualification"},
                vendor_config={"stt": "deepgram"},
            ),
        ),
    )
    updated = service.update_agent(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.agent_id,
        AgentDefinitionUpdateInput(status="published"),
    )
    versioned = service.create_version(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.agent_id,
        AgentVersionCreateInput(
            pipeline_mode="realtime_s2s",
            routing_config={"entry": "handoff"},
            vendor_config={"llm": "openai-realtime"},
        ),
    )

    assert created is not None
    assert created.latest_version is not None
    assert created.latest_version.version_number == 1
    assert len(created.versions) == 1
    assert updated is not None
    assert updated.status == "published"
    assert versioned is not None
    assert versioned.latest_version is not None
    assert versioned.latest_version.version_number == 2
    assert versioned.latest_version.pipeline_mode == "realtime_s2s"
    assert len(versioned.versions) == 2


def test_agent_catalog_service_returns_none_for_workspace_outside_tenant(
    session, seeded_domain
) -> None:
    agents = AgentCatalogService(session).list_workspace_agents(
        "other-tenant", seeded_domain["workspace"].id
    )

    assert agents is None


def test_workspace_admin_service_returns_none_for_missing_tenant(session, seeded_domain) -> None:
    workspace = WorkspaceAdminService(session).create_workspace(
        "missing", WorkspaceCreateInput(name="Ops")
    )

    assert workspace is None


def test_call_history_service_returns_none_for_workspace_outside_tenant(
    session, seeded_domain
) -> None:
    calls = CallHistoryService(session).list_recent_calls(
        "other-tenant", seeded_domain["workspace"].id
    )

    assert calls is None


def test_provider_account_admin_service_returns_none_for_missing_tenant(session) -> None:
    account = ProviderAccountAdminService(session).create_account(
        "missing",
        ProviderAccountCreateInput(
            provider_kind="stt",
            vendor_name="deepgram",
            label="Missing Tenant",
        ),
    )

    assert account is None


def test_workspace_state_service_returns_workspace_operating_state(session, seeded_domain) -> None:
    state = WorkspaceStateService(session).get_state("voice-demo", seeded_domain["workspace"].id)

    assert state is not None
    assert state.workspace.name == "Sales"
    assert len(state.agents) == 1
    assert len(state.calls) == 2


def test_team_admin_service_supports_member_lifecycle(session, seeded_domain) -> None:
    service = TeamAdminService(session)

    created = service.create_member(
        "voice-demo",
        seeded_domain["workspace"].id,
        TeamMemberCreateInput(
            email="qa@example.com",
            display_name="QA Reviewer",
            role="viewer",
        ),
    )
    updated = service.update_member(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.membership_id,
        TeamMemberUpdateInput(display_name="QA Manager", role="editor"),
    )
    deleted = service.delete_member(
        "voice-demo", seeded_domain["workspace"].id, created.membership_id
    )

    assert created is not None
    assert created.email == "qa@example.com"
    assert updated is not None
    assert updated.display_name == "QA Manager"
    assert updated.role == "editor"
    assert deleted is True


def test_call_review_service_supports_create_update_and_delete(session, seeded_domain) -> None:
    service = CallReviewService(session)

    created = service.create_review(
        "voice-demo",
        seeded_domain["workspace"].id,
        CallReviewCreateInput(
            agent_id=seeded_domain["agent"].id,
            lead_name="Riley Cole",
            company="Acorn Group",
            phone="+15551235555",
            scenario_name="Follow-up",
            status="Follow-up",
            duration="03:11",
            summary="Recovered intent and assigned owner follow-up.",
            outcome="Follow-up",
            next_step="Create task for sales owner.",
            vendor_trace="Deepgram -> GPT-4.1 -> ElevenLabs",
        ),
    )
    updated = service.update_review(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.call_id,
        CallReviewUpdateInput(synced_to_crm=True, next_step="Synced to CRM timeline."),
    )
    deleted = service.delete_review("voice-demo", seeded_domain["workspace"].id, created.call_id)

    assert created is not None
    assert created.agent_name == "Lead Router"
    assert updated is not None
    assert updated.synced_to_crm is True
    assert updated.next_step == "Synced to CRM timeline."
    assert deleted is True
