from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from voice_backend.models import AgentDefinition, AgentVersion, Tenant, Workspace


class AgentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_definition(
        self, tenant_id, workspace_id, agent_key: str, name: str, status: str = "draft"
    ) -> AgentDefinition:
        agent = AgentDefinition(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            agent_key=agent_key,
            name=name,
            status=status,
        )
        self.session.add(agent)
        self.session.flush()
        return agent

    def create_version(
        self,
        agent_definition_id,
        version_number: int,
        pipeline_mode: str,
        routing_config: dict[str, object] | None = None,
        vendor_config: dict[str, object] | None = None,
    ) -> AgentVersion:
        version = AgentVersion(
            agent_definition_id=agent_definition_id,
            version_number=version_number,
            pipeline_mode=pipeline_mode,
            routing_config=routing_config or {},
            vendor_config=vendor_config or {},
        )
        self.session.add(version)
        self.session.flush()
        return version

    def list_by_workspace(self, tenant_id, workspace_id) -> list[AgentDefinition]:
        statement = (
            select(AgentDefinition)
            .where(
                AgentDefinition.tenant_id == tenant_id,
                AgentDefinition.workspace_id == workspace_id,
            )
            .options(selectinload(AgentDefinition.versions))
            .order_by(AgentDefinition.name)
        )
        return list(self.session.scalars(statement))

    def get_definition_for_workspace(
        self, tenant_id, workspace_id, agent_definition_id
    ) -> AgentDefinition | None:
        statement = (
            select(AgentDefinition)
            .where(
                AgentDefinition.tenant_id == tenant_id,
                AgentDefinition.workspace_id == workspace_id,
                AgentDefinition.id == agent_definition_id,
            )
            .options(selectinload(AgentDefinition.versions))
            .execution_options(populate_existing=True)
        )
        return self.session.scalar(statement)

    def get_browser_session_dependencies(
        self, tenant_slug: str, workspace_id, agent_definition_id
    ) -> tuple[Tenant, Workspace, AgentDefinition, AgentVersion] | None:
        """Load the immutable browser-session snapshot in one database round trip."""
        statement = (
            select(Tenant, Workspace, AgentDefinition, AgentVersion)
            .join(Workspace, Workspace.tenant_id == Tenant.id)
            .join(
                AgentDefinition,
                AgentDefinition.workspace_id == Workspace.id,
            )
            .join(
                AgentVersion,
                AgentVersion.agent_definition_id == AgentDefinition.id,
            )
            .where(
                Tenant.slug == tenant_slug,
                Workspace.id == workspace_id,
                AgentDefinition.id == agent_definition_id,
                AgentDefinition.tenant_id == Tenant.id,
            )
            .order_by(desc(AgentVersion.version_number))
            .limit(1)
        )
        row = self.session.execute(statement).first()
        return row

    def latest_version_for(self, agent_definition_id) -> AgentVersion | None:
        statement = (
            select(AgentVersion)
            .where(AgentVersion.agent_definition_id == agent_definition_id)
            .order_by(desc(AgentVersion.version_number))
            .limit(1)
        )
        return self.session.scalar(statement)

    def next_version_number_for(self, agent_definition_id) -> int:
        statement = select(func.max(AgentVersion.version_number)).where(
            AgentVersion.agent_definition_id == agent_definition_id
        )
        latest_version_number = self.session.scalar(statement)
        return int(latest_version_number or 0) + 1

    def get_definition_for_update(
        self, tenant_id, workspace_id, agent_definition_id
    ) -> AgentDefinition | None:
        statement = (
            select(AgentDefinition)
            .where(
                AgentDefinition.tenant_id == tenant_id,
                AgentDefinition.workspace_id == workspace_id,
                AgentDefinition.id == agent_definition_id,
            )
            .with_for_update()
        )
        return self.session.scalar(statement)

    def update_version(
        self,
        version: AgentVersion,
        *,
        pipeline_mode: str | None = None,
        routing_config: dict[str, object] | None = None,
        vendor_config: dict[str, object] | None = None,
        published_at=None,
    ) -> AgentVersion:
        if pipeline_mode is not None:
            version.pipeline_mode = pipeline_mode
        if routing_config is not None:
            version.routing_config = routing_config
        if vendor_config is not None:
            version.vendor_config = vendor_config
        if published_at is not None:
            version.published_at = published_at
        self.session.flush()
        return version

    def update_definition(
        self,
        agent: AgentDefinition,
        *,
        agent_key: str | None = None,
        name: str | None = None,
        status: str | None = None,
    ) -> AgentDefinition:
        if agent_key is not None:
            agent.agent_key = agent_key
        if name is not None:
            agent.name = name
        if status is not None:
            agent.status = status
        self.session.flush()
        return agent

    def delete_definition(self, agent: AgentDefinition) -> None:
        self.session.delete(agent)
        self.session.flush()
