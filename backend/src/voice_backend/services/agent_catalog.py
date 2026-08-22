from sqlalchemy.orm import Session

from voice_backend.repositories import AgentRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import AgentSummary


class AgentCatalogService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)

    def list_workspace_agents(self, tenant_slug: str, workspace_id) -> list[AgentSummary] | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None

        items: list[AgentSummary] = []
        for agent in self.agents.list_by_workspace(tenant.id, workspace_id):
            latest_version = agent.versions[-1] if agent.versions else None
            items.append(
                AgentSummary(
                    agent_id=agent.id,
                    workspace_id=agent.workspace_id,
                    agent_key=agent.agent_key,
                    name=agent.name,
                    status=agent.status,
                    latest_version_number=latest_version.version_number if latest_version else None,
                    latest_pipeline_mode=latest_version.pipeline_mode if latest_version else None,
                )
            )
        return items
