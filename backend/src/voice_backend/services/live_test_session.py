from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from voice_backend.repositories import AgentRepository, CallRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import (
    BrowserRtcSessionCreateInput,
    BrowserRtcSessionRecord,
    LiveTestSessionRecord,
    LiveTestSessionUpdateInput,
)


def _status_label_from_lifecycle(lifecycle_status: str) -> str:
    return "Dropped" if lifecycle_status in {"failed", "cancelled"} else "Completed"


def _resolved_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _build_live_test_session_record(call) -> LiveTestSessionRecord:
    resolved = call.resolved_config or {}
    agent = call.agent_version.agent_definition if call.agent_version is not None else None
    return LiveTestSessionRecord(
        call_id=call.id,
        agent_id=agent.id if agent is not None else None,
        agent_name=str(resolved.get("agent_name", agent.name if agent is not None else "Unknown")),
        lifecycle_status=str(resolved.get("lifecycle_status", call.status)),
        room_name=str(resolved.get("room_name", "")),
        dispatch_id=str(resolved.get("dispatch_id", "")),
        participant_identity=str(resolved.get("participant_identity", "")),
        participant_name=str(resolved.get("participant_name", "")),
        vendor_trace=str(resolved.get("vendor_trace", "")),
        summary=str(resolved.get("summary", "")),
        outcome=str(resolved.get("outcome", "")),
        next_step=str(resolved.get("next_step", "")),
        synced_to_crm=bool(resolved.get("synced_to_crm", False)),
        transcript=list(resolved.get("transcript", [])),
        extracted_variables=list(resolved.get("extracted_variables", [])),
        tool_calls=list(resolved.get("tool_calls", [])),
        guardrails=list(resolved.get("guardrails", [])),
        metrics=dict(resolved.get("metrics", {})),
        event_log=list(resolved.get("event_log", [])),
        started_at=call.started_at,
        ended_at=call.ended_at,
        created_at=call.created_at,
    )


class LiveTestSessionService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)

    def create_session_record(
        self,
        tenant_slug: str,
        workspace_id,
        payload: BrowserRtcSessionCreateInput,
        session_record: BrowserRtcSessionRecord,
        *,
        launched_by: str,
    ) -> LiveTestSessionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, payload.agent_id)
        if agent is None:
            return None

        latest_version = agent.versions[-1] if agent.versions else None
        metadata = payload.metadata
        serialized_session = (
            session_record.model_dump() if hasattr(session_record, "model_dump") else {}
        )
        session_payload = getattr(session_record, "session", {}) or {}
        runtime_payload = getattr(session_record, "runtime", {}) or {}
        room_name = getattr(session_record, "room_name", serialized_session.get("room_name", ""))
        dispatch_id = getattr(session_record, "dispatch_id", serialized_session.get("dispatch_id", ""))
        participant_identity = getattr(
            session_record,
            "participant_identity",
            serialized_session.get("participant_identity", ""),
        )
        participant_name = getattr(
            session_record,
            "participant_name",
            serialized_session.get("participant_name", ""),
        )
        initial_summary = f"Browser live test prepared for {agent.name}."
        call = self.calls.create(
            tenant.id,
            workspace.id,
            direction="test",
            status="queued",
            is_test=True,
            agent_version_id=latest_version.id if latest_version is not None else None,
            from_number=str(metadata.get("launched_by", launched_by)),
            to_number=str(metadata.get("launch_number", "browser-live")),
            resolved_config={
                "is_test": True,
                "launch_source": "browser_live",
                "session_id": payload.session_id or session_payload.get("session_id", ""),
                "room_name": room_name,
                "dispatch_id": dispatch_id,
                "participant_identity": participant_identity,
                "participant_name": participant_name,
                "agent_name": agent.name,
                "scenario_name": "Browser live test",
                "status_label": "Completed",
                "lifecycle_status": "queued",
                "summary": initial_summary,
                "outcome": "Queued for live test",
                "next_step": "Join the room and speak with the agent.",
                "vendor_trace": str(metadata.get("vendor_trace", "")),
                "synced_to_crm": False,
                "extracted_variables": [],
                "tool_calls": [],
                "guardrails": [],
                "transcript": [],
                "metrics": {
                    "room_name": room_name,
                    "dispatch_id": dispatch_id,
                    "runtime_transport": runtime_payload.get("transport"),
                },
                "event_log": [
                    {
                        "event_type": "session_prepared",
                        "message": initial_summary,
                        "occurred_at": datetime.now(UTC).isoformat(),
                    }
                ],
            },
        )
        return _build_live_test_session_record(call)

    def update_session_record(
        self,
        tenant_slug: str,
        workspace_id,
        call_id,
        payload: LiveTestSessionUpdateInput,
    ) -> LiveTestSessionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id)
        if call is None or not call.is_test:
            return None

        resolved = dict(call.resolved_config or {})

        if payload.lifecycle_status is not None:
            resolved["lifecycle_status"] = payload.lifecycle_status
            resolved["status_label"] = payload.display_status or _status_label_from_lifecycle(
                payload.lifecycle_status
            )
            call_status = payload.lifecycle_status
        else:
            call_status = None

        if payload.summary is not None:
            resolved["summary"] = payload.summary
        if payload.outcome is not None:
            resolved["outcome"] = payload.outcome
        if payload.next_step is not None:
            resolved["next_step"] = payload.next_step
        if payload.synced_to_crm is not None:
            resolved["synced_to_crm"] = payload.synced_to_crm
        if payload.transcript is not None:
            current_transcript = list(resolved.get("transcript", []))
            if len(payload.transcript) >= len(current_transcript):
                resolved["transcript"] = payload.transcript
        if payload.extracted_variables is not None:
            resolved["extracted_variables"] = payload.extracted_variables
        if payload.tool_calls is not None:
            resolved["tool_calls"] = payload.tool_calls
        if payload.guardrails is not None:
            resolved["guardrails"] = payload.guardrails
        if payload.metrics is not None:
            resolved["metrics"] = {
                **dict(resolved.get("metrics", {})),
                **payload.metrics,
            }
        if payload.append_events:
            event_log = list(resolved.get("event_log", []))
            for event in payload.append_events:
                event_log.append(
                    {
                        "event_type": event.event_type,
                        "message": event.message,
                        "occurred_at": (
                            _resolved_timestamp(event.occurred_at) or datetime.now(UTC)
                        ).isoformat(),
                        "payload": event.payload,
                    }
                )
            resolved["event_log"] = event_log

        updated = self.calls.update(
            call,
            status=call_status,
            resolved_config=resolved,
            started_at=_resolved_timestamp(payload.started_at),
            ended_at=_resolved_timestamp(payload.ended_at),
        )
        return _build_live_test_session_record(updated)
