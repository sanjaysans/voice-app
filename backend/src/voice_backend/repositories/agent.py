from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from voice_backend.models import AgentDefinition, AgentVersion


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

    def latest_version_for(self, agent_definition_id) -> AgentVersion | None:
        statement = (
            select(AgentVersion)
            .where(AgentVersion.agent_definition_id == agent_definition_id)
            .order_by(desc(AgentVersion.version_number))
            .limit(1)
        )
        return self.session.scalar(statement)
