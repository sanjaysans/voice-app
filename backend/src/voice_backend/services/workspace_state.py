from datetime import UTC, datetime

from sqlalchemy.orm import Session

from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    ProviderAccountRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import (
    AgentStudioRecord,
    CallReviewRecord,
    ConnectionRecord,
    ProviderAccountRecord,
    SessionMembershipRecord,
    WorkspaceAppState,
    WorkspaceRecord,
    redact_secret_fields,
)
from voice_backend.secrets import build_provider_config_preview
from voice_backend.services.agent_config import normalize_flow_edges, normalize_flow_nodes
from voice_backend.services.provider_account_admin import to_provider_account_record
from voice_backend.services.read_cache import get_read_cache, set_read_cache


def _title_case_status(status: str) -> str:
    return " ".join(part.capitalize() for part in status.replace("_", " ").split())


def _status_tone(status: str) -> str:
    return "success" if status == "published" else "warning" if status == "draft" else "neutral"


def _relative_label(timestamp) -> str:
    if timestamp is None:
        return "Unknown"
    delta = datetime.now(UTC) - timestamp.astimezone(UTC)
    minutes = max(int(delta.total_seconds() // 60), 0)
    if minutes < 1:
        return "Just now"
    if minutes < 60:
        return f"{minutes} minutes ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hours ago"
    days = hours // 24
    return f"{days} days ago"


def _build_agent_record(agent) -> AgentStudioRecord:
    latest_version = agent.versions[-1] if agent.versions else None
    routing_config = latest_version.routing_config if latest_version is not None else {}
    vendor_config = latest_version.vendor_config if latest_version is not None else {}
    flow_nodes = normalize_flow_nodes(routing_config.get("flow_nodes", []))
    return AgentStudioRecord(
        agent_id=agent.id,
        workspace_id=agent.workspace_id,
        agent_key=agent.agent_key,
        name=agent.name,
        description=str(routing_config.get("description", "")),
        shared_prompt=str(routing_config.get("shared_prompt", "")),
        status=_title_case_status(agent.status),
        status_tone=_status_tone(agent.status),
        last_edited=_relative_label(agent.updated_at),
        segment=str(routing_config.get("segment", "")),
        goal=str(routing_config.get("goal", "")),
        stack=vendor_config.get(
            "stack",
            {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "ElevenLabs"},
        ),
        runtime_profile=redact_secret_fields(vendor_config.get("runtime_profile", {})),
        variables=routing_config.get("variables", []),
        flow_nodes=flow_nodes,
        flow_edges=normalize_flow_edges(routing_config.get("flow_edges", []), flow_nodes),
        tools_catalog=routing_config.get("tools_catalog", []),
        knowledge_sources=routing_config.get("knowledge_sources", []),
        latest_version_number=latest_version.version_number if latest_version is not None else None,
        latest_pipeline_mode=latest_version.pipeline_mode if latest_version is not None else None,
    )


def _connection_status(config: dict[str, object]) -> str:
    return str(config.get("ui_status", "Needs setup"))


def _connection_tone(status: str) -> str:
    return "success" if status == "Connected" else "warning" if status == "Warning" else "neutral"


def _connection_category(provider_kind: str) -> str:
    mapping = {
        "telephony": "Telephony",
        "crm": "CRM",
        "calendar": "Calendar",
        "knowledge": "Knowledge",
    }
    return mapping.get(provider_kind, "Knowledge")


def _build_connection_record(account) -> ConnectionRecord:
    config = build_provider_config_preview(account.config or {})
    status = _connection_status(config)
    return ConnectionRecord(
        provider_account_id=account.id,
        category=_connection_category(account.provider_kind),
        name=str(config.get("name", account.label)),
        vendor=account.vendor_name,
        description=str(config.get("description", f"{account.vendor_name} connection")),
        status=status,
        tone=_connection_tone(status),
        detail=str(config.get("detail", "Connection ready for setup.")),
        last_checked=str(config.get("last_checked", "Not configured")),
    )


def _call_tone(status: str) -> str:
    return "success" if status == "Completed" else "warning" if status == "Follow-up" else "danger"


def _string_record_list(value, *, dict_value: bool = False) -> list:
    if isinstance(value, dict):
        return (
            [{"key": str(key), "value": str(item)} for key, item in value.items()]
            if dict_value
            else []
        )
    if not isinstance(value, list):
        return []
    normalized = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized.append({str(key): str(item_value) for key, item_value in item.items()})
    return normalized


def _build_call_record(call) -> CallReviewRecord:
    resolved = call.resolved_config or {}
    agent = call.agent_version.agent_definition if call.agent_version is not None else None
    return CallReviewRecord(
        call_id=call.id,
        agent_id=agent.id if agent is not None else None,
        is_test=call.is_test,
        direction=call.direction,
        agent_name=str(resolved.get("agent_name", agent.name if agent is not None else "Unknown")),
        lead_name=str(resolved.get("lead_name", "Unknown lead")),
        company=str(resolved.get("company", "Unknown company")),
        phone=str(call.to_number or resolved.get("phone", "")),
        scenario_name=str(resolved.get("scenario_name", "Manual call")),
        status=str(resolved.get("status_label", "Completed")),
        status_tone=_call_tone(str(resolved.get("status_label", "Completed"))),
        duration=str(resolved.get("duration", "00:00")),
        time=str(resolved.get("time", call.created_at.isoformat())),
        summary=str(resolved.get("summary", "")),
        outcome=str(resolved.get("outcome", "")),
        next_step=str(resolved.get("next_step", "")),
        vendor_trace=str(resolved.get("vendor_trace", "")),
        synced_to_crm=bool(resolved.get("synced_to_crm", False)),
        extracted_variables=_string_record_list(
            resolved.get("extracted_variables", {}), dict_value=True
        ),
        tool_calls=_string_record_list(resolved.get("tool_calls", [])),
        guardrails=[str(item) for item in resolved.get("guardrails", []) if item is not None],
        transcript=_string_record_list(resolved.get("transcript", [])),
        created_at=call.created_at,
        started_at=call.started_at,
        ended_at=call.ended_at,
    )


class WorkspaceStateService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)
        self.accounts = ProviderAccountRepository(session)

    def get_state(
        self,
        tenant_slug: str,
        workspace_id,
        *,
        tenant_id=None,
        workspace_membership: SessionMembershipRecord | None = None,
    ) -> WorkspaceAppState | None:
        cache_key = (
            "workspace-state.get",
            tenant_slug,
            str(workspace_id),
            str(tenant_id or ""),
        )
        cached = get_read_cache(cache_key)
        if cached is not None:
            return cached

        resolved_tenant_id = tenant_id
        if resolved_tenant_id is None:
            tenant = self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                return None
            resolved_tenant_id = tenant.id

        if workspace_membership is not None:
            workspace_record = WorkspaceRecord(
                workspace_id=workspace_membership.workspace_id,
                tenant_id=workspace_membership.tenant_id,
                name=workspace_membership.workspace_name,
                is_default=workspace_membership.workspace_is_default,
                created_at=datetime.now(UTC),
            )
        else:
            workspace = self.workspaces.get_for_tenant(resolved_tenant_id, workspace_id)
            if workspace is None:
                return None
            workspace_record = WorkspaceRecord(
                workspace_id=workspace.id,
                tenant_id=workspace.tenant_id,
                name=workspace.name,
                is_default=workspace.is_default,
                created_at=workspace.created_at,
            )

        provider_accounts = self.accounts.list_by_tenant(resolved_tenant_id)
        provider_account_records: list[ProviderAccountRecord] = [
            to_provider_account_record(account) for account in provider_accounts
        ]

        return set_read_cache(
            cache_key,
            WorkspaceAppState(
                workspace=workspace_record,
                agents=[
                    _build_agent_record(agent)
                    for agent in self.agents.list_by_workspace(resolved_tenant_id, workspace_id)
                ],
                connections=[
                    _build_connection_record(account)
                    for account in provider_accounts
                    if _connection_category(account.provider_kind)
                    in {"Telephony", "CRM", "Calendar", "Knowledge"}
                ],
                provider_accounts=provider_account_records,
                calls=[
                    _build_call_record(call)
                    for call in self.calls.list_recent_by_workspace(
                        resolved_tenant_id,
                        workspace_id,
                        limit=100,
                        include_tests=False,
                    )
                ],
            ),
        )
