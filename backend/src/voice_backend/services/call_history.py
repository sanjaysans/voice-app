from sqlalchemy.orm import Session

from voice_backend.repositories import CallRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import CallSummary


class CallHistoryService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.calls = CallRepository(session)

    def list_recent_calls(
        self, tenant_slug: str, workspace_id, limit: int = 20
    ) -> list[CallSummary] | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None

        items: list[CallSummary] = []
        for call in self.calls.list_recent_by_workspace(tenant.id, workspace_id, limit=limit):
            agent_name = None
            if call.agent_version and call.agent_version.agent_definition:
                agent_name = call.agent_version.agent_definition.name
            items.append(
                CallSummary(
                    call_id=call.id,
                    workspace_id=call.workspace_id,
                    agent_name=agent_name,
                    direction=call.direction,
                    status=call.status,
                    from_number=call.from_number,
                    to_number=call.to_number,
                    started_at=call.started_at,
                    ended_at=call.ended_at,
                    created_at=call.created_at,
                )
            )
        return items
