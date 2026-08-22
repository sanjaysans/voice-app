from sqlalchemy.orm import Session

from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import TenantOverview


class TenantOverviewService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)

    def get_by_slug(self, tenant_slug: str) -> TenantOverview | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None

        workspaces = self.workspaces.list_by_tenant(tenant.id)
        agent_count = sum(
            len(self.agents.list_by_workspace(tenant.id, workspace.id)) for workspace in workspaces
        )
        return TenantOverview(
            tenant_id=tenant.id,
            tenant_slug=tenant.slug,
            tenant_name=tenant.name,
            workspace_count=len(workspaces),
            agent_count=agent_count,
            active_call_count=self.calls.count_active_by_tenant(tenant.id),
            total_call_count=self.calls.count_all_by_tenant(tenant.id),
        )
