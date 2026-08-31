from uuid import uuid4

import pytest

from voice_backend.config import Settings
from voice_backend.repositories import ProviderAccountRepository
from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionUpdateInput,
    AgentStudioUpdateInput,
    AgentVersionCreateInput,
    BrowserRtcSessionCreateInput,
    BrowserRtcSessionRecord,
    BrowserRtcSessionResolvedInput,
    CallReviewCreateInput,
    CallReviewUpdateInput,
    LiveTestSessionUpdateInput,
    ProviderAccountCreateInput,
    ProviderAccountUpdateInput,
    TeamMemberCreateInput,
    TeamMemberUpdateInput,
    TenantCreateInput,
    TenantUpdateInput,
    WorkspaceCreateInput,
    WorkspaceUpdateInput,
)
from voice_backend.secrets import decrypt_provider_config
from voice_backend.services import (
    AgentCatalogService,
    AgentDefinitionAdminService,
    CallHistoryService,
    CallReviewService,
    LiveTestSessionService,
    ProviderAccountAdminService,
    RealtimeSessionService,
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


def test_call_history_service_filters_and_pages_call_logs(session, seeded_domain) -> None:
    second_call = seeded_domain["second_call"]
    second_call.is_test = True
    second_call.resolved_config = {
        "agent_name": "Lead Router",
        "lead_name": "Test Caller",
        "company": "Vegrow",
        "phone": "+15550102",
        "scenario_name": "Browser live test",
        "status_label": "Completed",
        "duration": "00:42",
        "time": "Today",
        "summary": "Completed browser validation run.",
        "outcome": "Completed",
        "next_step": "Review transcript.",
        "vendor_trace": "Deepgram -> OpenAI -> Cartesia",
        "synced_to_crm": False,
        "extracted_variables": [],
        "tool_calls": [],
        "guardrails": [],
        "transcript": [],
    }
    session.commit()

    response = CallHistoryService(session).list_call_logs(
        "voice-demo",
        seeded_domain["workspace"].id,
        page=1,
        page_size=10,
        status="Completed",
        call_type="test",
        query="browser",
    )

    assert response is not None
    assert response.total_items == 1
    assert response.total_pages == 1
    assert response.items[0].is_test is True
    assert response.items[0].scenario_name == "Browser live test"


def test_tenant_overview_and_workspace_state_exclude_test_calls(session, seeded_domain) -> None:
    test_call = seeded_domain["second_call"]
    test_call.is_test = True
    session.commit()

    overview = TenantOverviewService(session).get_by_slug("voice-demo")
    workspace_state = WorkspaceStateService(session).get_state(
        "voice-demo", seeded_domain["workspace"].id
    )

    assert overview is not None
    assert overview.active_call_count == 1
    assert overview.total_call_count == 2
    assert workspace_state is not None
    assert all(call.is_test is False for call in workspace_state.calls)


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


def test_provider_account_update_preserves_redacted_secrets(session, seeded_domain) -> None:
    service = ProviderAccountAdminService(session)
    created = service.create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="llm",
            vendor_name="openai",
            label="Primary LLM",
            config={"api_key": "sk-live", "display_name": "Primary LLM"},
        ),
    )

    assert created is not None
    updated = service.update_account(
        "voice-demo",
        created.provider_account_id,
        ProviderAccountUpdateInput(
            label="Updated LLM",
            config={"display_name": "Updated LLM", "api_key": ""},
        ),
    )
    stored = ProviderAccountRepository(session).get_for_tenant(
        seeded_domain["tenant"].id, created.provider_account_id
    )

    assert updated is not None
    assert stored is not None
    assert decrypt_provider_config(stored.config)["api_key"] == "sk-live"
    assert decrypt_provider_config(stored.config)["display_name"] == "Updated LLM"


def test_provider_account_admin_service_runs_health_check(
    session, seeded_domain, monkeypatch
) -> None:
    service = ProviderAccountAdminService(session)

    created = service.create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="stt",
            vendor_name="deepgram",
            label="Deepgram Live",
            status="draft",
            config={"api_key": "dg_live_key"},
        ),
    )

    class DummyResponse:
        status_code = 200

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def get(self, *args, **kwargs):
            return DummyResponse()

    monkeypatch.setattr("voice_backend.services.provider_account_admin.httpx.Client", DummyClient)

    assert created is not None
    checked = service.run_health_check("voice-demo", created.provider_account_id)

    assert checked is not None
    assert checked.status == "active"
    assert checked.preview["ui_status"] == "Connected"
    assert "api_key" not in checked.preview
    assert "passed the live Deepgram credential check" in str(checked.preview["detail"])
    stored = ProviderAccountRepository(session).get_for_tenant(
        seeded_domain["tenant"].id, created.provider_account_id
    )
    assert isinstance(stored.config["api_key"], dict)


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


def test_agent_definition_admin_service_persists_runtime_profile(session, seeded_domain) -> None:
    service = AgentDefinitionAdminService(session)

    created = service.create_agent(
        "voice-demo",
        seeded_domain["workspace"].id,
        AgentDefinitionCreateInput(
            agent_key="runtime-router",
            name="Runtime Router",
            status="draft",
            initial_version=AgentVersionCreateInput(
                pipeline_mode="stt_llm_tts",
                routing_config={},
                vendor_config={},
            ),
        ),
    )

    updated = service.update_studio(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.agent_id,
        AgentStudioUpdateInput(
            runtime_profile={
                "pipelineMode": "stt_llm_tts",
                "stt": {"providerAccountId": "stt-1", "model": "flux-general-en"},
                "llm": {"providerAccountId": "llm-1", "model": "gpt-4.1-mini"},
                "tts": {"providerAccountId": "tts-1", "model": "sonic-3"},
            }
        ),
    )

    assert updated is not None
    assert updated.latest_version_number == 1
    assert updated.runtime_profile["stt"]["providerAccountId"] == "stt-1"


def test_agent_definition_admin_service_returns_shared_prompt_in_studio_record(
    session, seeded_domain
) -> None:
    service = AgentDefinitionAdminService(session)

    created = service.create_agent(
        "voice-demo",
        seeded_domain["workspace"].id,
        AgentDefinitionCreateInput(
            agent_key="prompt-router",
            name="Prompt Router",
            status="draft",
            initial_version=AgentVersionCreateInput(
                pipeline_mode="stt_llm_tts",
                routing_config={},
                vendor_config={},
            ),
        ),
    )

    updated = service.update_studio(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.agent_id,
        AgentStudioUpdateInput(shared_prompt="Stay concise and confirm intent."),
    )

    assert updated is not None
    assert updated.shared_prompt == "Stay concise and confirm intent."


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
    assert state.agents[0].runtime_profile == {}


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


def test_live_test_session_service_persists_and_updates_browser_sessions(
    session, seeded_domain
) -> None:
    service = LiveTestSessionService(session)
    stt_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="stt",
            vendor_name="deepgram",
            label="Live STT",
            status="active",
            config={"api_key": "dg-key"},
        ),
    )
    llm_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="llm",
            vendor_name="openai",
            label="Primary LLM",
            status="active",
            config={"api_key": "oa-key"},
        ),
    )
    tts_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="tts",
            vendor_name="cartesia",
            label="Primary TTS",
            status="active",
            config={"api_key": "ca-key"},
        ),
    )
    AgentDefinitionAdminService(session).update_studio(
        "voice-demo",
        seeded_domain["workspace"].id,
        seeded_domain["agent"].id,
        AgentStudioUpdateInput(
            description="Primary qualification flow",
            shared_prompt="Qualify clearly.",
            runtime_profile={
                "workflow": {"sampleRate": 24000},
                "prompt": {"openingMessage": "Hello from Voice."},
                "stt": {
                    "providerAccountId": str(stt_account.provider_account_id),
                    "model": "flux-general-en",
                    "language": "en-US",
                },
                "llm": {
                    "providerAccountId": str(llm_account.provider_account_id),
                    "model": "gpt-4.1-mini",
                    "temperature": 0.2,
                },
                "tts": {
                    "providerAccountId": str(tts_account.provider_account_id),
                    "model": "sonic-3",
                    "voiceId": "voice-1",
                    "language": "en",
                },
            },
        ),
    )
    prepared = service.prepare_browser_session(
        "voice-demo",
        seeded_domain["workspace"].id,
        BrowserRtcSessionCreateInput(
            agent_id=seeded_domain["agent"].id,
            metadata={
                "launch_number": "browser-live",
                "vendor_trace": "Deepgram -> OpenAI -> Cartesia",
            },
        ),
    )
    assert prepared is not None

    created = service.create_session_record(
        "voice-demo",
        seeded_domain["workspace"].id,
        prepared.session_input,
        BrowserRtcSessionRecord(
            call_id=None,
            room_name="voice-room-local",
            participant_identity="web-user-1",
            participant_name="Voice Admin",
            server_url="ws://127.0.0.1:7880",
            access_token="jwt-token",
            dispatch_id="dispatch-123",
            dispatch_agent_name="voice-router-agent",
            session={"session_id": "session-1"},
            runtime={"transport": "livekit"},
            warnings=[],
            errors=[],
        ),
        launched_by="admin@voice.local",
    )
    assert created is not None

    updated = service.update_session_record(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.call_id,
        LiveTestSessionUpdateInput(
            lifecycle_status="completed",
            summary="Browser live test completed cleanly.",
            outcome="Test call completed",
            next_step="Review the transcript.",
            transcript=[{"speaker": "You", "timestamp": "00:01", "text": "Hello there"}],
            metrics={"duration": "00:12"},
            append_events=[
                {
                    "event_type": "room_connected",
                    "message": "Connected to LiveKit room.",
                }
            ],
        ),
    )

    assert updated is not None
    assert updated.is_test is True
    assert updated.lifecycle_status == "completed"
    assert updated.transcript[0]["text"] == "Hello there"
    assert updated.event_log[-1]["event_type"] == "room_connected"
    assert updated.metrics["duration"] == "00:12"


def test_live_test_session_service_sanitizes_invalid_stt_runtime_values(
    session, seeded_domain
) -> None:
    service = LiveTestSessionService(session)

    stt_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="stt",
            vendor_name="deepgram",
            label="Deepgram STT",
            status="active",
            config={"api_key": "dg-key"},
        ),
    )
    llm_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="llm",
            vendor_name="openai",
            label="OpenAI",
            status="active",
            config={"api_key": "oa-key"},
        ),
    )
    tts_account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="tts",
            vendor_name="cartesia",
            label="Cartesia",
            status="active",
            config={"api_key": "ca-key"},
        ),
    )
    AgentDefinitionAdminService(session).update_studio(
        "voice-demo",
        seeded_domain["workspace"].id,
        seeded_domain["agent"].id,
        AgentStudioUpdateInput(
            description="Primary qualification flow",
            shared_prompt="Qualify clearly.",
            runtime_profile={
                "workflow": {"sampleRate": "bad-value"},
                "stt": {
                    "providerAccountId": str(stt_account.provider_account_id),
                    "model": "nova-3-general",
                    "language": "en-US",
                    "endpointingMs": -5,
                    "interimResults": "false",
                    "enableDiarization": "false",
                },
                "llm": {
                    "providerAccountId": str(llm_account.provider_account_id),
                    "model": "gpt-4.1-mini",
                    "temperature": "bad-value",
                },
                "tts": {
                    "providerAccountId": str(tts_account.provider_account_id),
                    "model": "sonic-3",
                    "voiceId": "voice-1",
                    "language": "en",
                    "speed": "bad-value",
                    "volume": "bad-value",
                },
            },
        ),
    )

    prepared = service.prepare_browser_session(
        "voice-demo",
        seeded_domain["workspace"].id,
        BrowserRtcSessionCreateInput(agent_id=seeded_domain["agent"].id),
    )

    assert prepared is not None
    assert prepared.session_input.stt.model == "flux-general-en"
    assert prepared.session_input.stt.endpointing_ms == 400
    assert prepared.session_input.stt.utterance_end_ms == 800
    assert prepared.session_input.stt.eager_eot_threshold == 0.35
    assert prepared.session_input.stt.eot_threshold == 0.6
    assert prepared.session_input.stt.eot_timeout_ms == 800
    assert prepared.session_input.stt.interim_results is False
    assert prepared.session_input.stt.enable_diarization is False
    assert prepared.session_input.llm.temperature == 0.2
    assert prepared.session_input.llm.max_output_tokens == 240
    assert prepared.session_input.llm.service_tier == "default"
    assert prepared.session_input.tts.speed == 1
    assert prepared.session_input.tts.volume == 1
    assert prepared.session_input.tts.sample_rate == 24000


@pytest.mark.asyncio
async def test_realtime_session_service_builds_join_credentials(monkeypatch) -> None:
    manifest_response = {
        "session": {"room_name": "voice-room-local", "participant_identity": "web-user-1"},
        "dispatch_agent_name": "voice-router-agent",
        "dispatch_metadata": '{"stt": {"api_key": "dg-key"}}',
        "runtime": {"transport": "livekit"},
        "warnings": [],
        "errors": [],
    }

    class StubResponse:
        status_code = 200

        def json(self):
            return manifest_response

    class StubAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

        async def post(self, _url, json, headers):
            assert json["dispatch_agent_name"] == "voice-router-agent"
            assert headers["X-Voice-Internal-Key"] == "voice-local-internal-key"
            return StubResponse()

    class StubDispatch:
        id = "dispatch-123"

    class StubRoomService:
        async def create_room(self, _request):
            return None

    class StubAgentDispatchService:
        async def create_dispatch(self, _request):
            return StubDispatch()

    class StubLiveKitAPI:
        def __init__(self, **kwargs) -> None:
            self.room = StubRoomService()
            self.agent_dispatch = StubAgentDispatchService()

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

    monkeypatch.setattr(
        "voice_backend.services.realtime_session.httpx.AsyncClient",
        lambda *args, **kwargs: StubAsyncClient(),
    )
    monkeypatch.setattr(
        "voice_backend.services.realtime_session.LiveKitAPI",
        StubLiveKitAPI,
    )

    service = RealtimeSessionService(
        Settings(
            _env_file=None,
            database_url="sqlite+pysqlite:///:memory:",
            pipeline_base_url="http://127.0.0.1:8101",
        )
    )
    created = await service.create_browser_session(
        BrowserRtcSessionResolvedInput(
            agent_id=uuid4(),
            stt={"api_key": "dg-key"},
            llm={"api_key": "oa-key"},
            tts={"api_key": "ca-key"},
        ),
        user_id=uuid4(),
        display_name="Voice Admin",
    )

    assert created.room_name == "voice-room-local"
    assert created.dispatch_id == "dispatch-123"
    assert created.dispatch_agent_name == "voice-router-agent"
    assert created.server_url == "ws://127.0.0.1:7880"
    assert created.participant_name == "Voice Admin"
