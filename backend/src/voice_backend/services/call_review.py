from sqlalchemy.orm import Session

from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import CallReviewCreateInput, CallReviewRecord, CallReviewUpdateInput
from voice_backend.services.workspace_state import _build_call_record


class CallReviewService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)

    def create_review(
        self,
        tenant_slug: str,
        workspace_id,
        payload: CallReviewCreateInput,
    ) -> CallReviewRecord | None:
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
        call = self.calls.create(
            tenant.id,
            workspace.id,
            direction="outbound",
            status=payload.status.lower().replace(" ", "_"),
            agent_version_id=latest_version.id if latest_version is not None else None,
            to_number=payload.phone,
            resolved_config={
                "agent_name": agent.name,
                "lead_name": payload.lead_name,
                "company": payload.company,
                "phone": payload.phone,
                "scenario_name": payload.scenario_name,
                "status_label": payload.status,
                "duration": payload.duration,
                "time": "Today",
                "summary": payload.summary,
                "outcome": payload.outcome,
                "next_step": payload.next_step,
                "vendor_trace": payload.vendor_trace,
                "synced_to_crm": payload.synced_to_crm,
                "extracted_variables": payload.extracted_variables,
                "tool_calls": payload.tool_calls,
                "guardrails": payload.guardrails,
                "transcript": payload.transcript,
            },
        )
        return _build_call_record(call)

    def update_review(
        self,
        tenant_slug: str,
        workspace_id,
        call_id,
        payload: CallReviewUpdateInput,
    ) -> CallReviewRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id)
        if call is None:
            return None
        resolved = dict(call.resolved_config or {})
        if payload.synced_to_crm is not None:
            resolved["synced_to_crm"] = payload.synced_to_crm
        if payload.next_step is not None:
            resolved["next_step"] = payload.next_step
        if payload.status is not None:
            resolved["status_label"] = payload.status
            call_status = payload.status.lower().replace(" ", "_")
        else:
            call_status = None
        updated = self.calls.update(call, status=call_status, resolved_config=resolved)
        return _build_call_record(updated)

    def delete_review(self, tenant_slug: str, workspace_id, call_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return False
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id)
        if call is None:
            return False
        self.calls.delete(call)
        return True
