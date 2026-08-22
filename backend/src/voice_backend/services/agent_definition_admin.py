from datetime import UTC, datetime

from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import AgentRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionRecord,
    AgentDefinitionUpdateInput,
    AgentStudioUpdateInput,
    AgentVersionCreateInput,
    AgentVersionRecord,
)

logger = get_logger(__name__)


def _to_version_record(version) -> AgentVersionRecord:
    return AgentVersionRecord(
        agent_version_id=version.id,
        version_number=version.version_number,
        pipeline_mode=version.pipeline_mode,
        routing_config=version.routing_config,
        vendor_config=version.vendor_config,
        published_at=version.published_at,
        created_at=version.created_at,
    )


def _to_record(agent) -> AgentDefinitionRecord:
    versions = [_to_version_record(version) for version in agent.versions]
    return AgentDefinitionRecord(
        agent_id=agent.id,
        tenant_id=agent.tenant_id,
        workspace_id=agent.workspace_id,
        agent_key=agent.agent_key,
        name=agent.name,
        status=agent.status,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        versions=versions,
        latest_version=versions[-1] if versions else None,
    )


class AgentDefinitionAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)

    def create_agent(
        self,
        tenant_slug: str,
        workspace_id,
        payload: AgentDefinitionCreateInput,
    ) -> AgentDefinitionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.create_definition(
            tenant.id,
            workspace.id,
            payload.agent_key,
            payload.name,
            status=payload.status,
        )
        if payload.initial_version is not None:
            self.agents.create_version(
                agent.id,
                1,
                payload.initial_version.pipeline_mode,
                routing_config=payload.initial_version.routing_config,
                vendor_config=payload.initial_version.vendor_config,
            )
        logger.info("agent_definition.created", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return _to_record(
            self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent.id)
        )

    def get_agent(self, tenant_slug: str, workspace_id, agent_id) -> AgentDefinitionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent_id)
        return _to_record(agent) if agent is not None else None

    def update_agent(
        self,
        tenant_slug: str,
        workspace_id,
        agent_id,
        payload: AgentDefinitionUpdateInput,
    ) -> AgentDefinitionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent_id)
        if agent is None:
            return None
        updated = self.agents.update_definition(
            agent,
            agent_key=payload.agent_key,
            name=payload.name,
            status=payload.status,
        )
        logger.info("agent_definition.updated", tenant_id=str(tenant.id), agent_id=str(updated.id))
        return _to_record(updated)

    def create_version(
        self,
        tenant_slug: str,
        workspace_id,
        agent_id,
        payload: AgentVersionCreateInput,
    ) -> AgentDefinitionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_update(tenant.id, workspace.id, agent_id)
        if agent is None:
            return None
        self.agents.create_version(
            agent.id,
            self.agents.next_version_number_for(agent.id),
            payload.pipeline_mode,
            routing_config=payload.routing_config,
            vendor_config=payload.vendor_config,
        )
        refreshed = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent.id)
        logger.info("agent_version.created", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return _to_record(refreshed)

    def update_studio(
        self,
        tenant_slug: str,
        workspace_id,
        agent_id,
        payload: AgentStudioUpdateInput,
    ) -> AgentDefinitionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_update(tenant.id, workspace.id, agent_id)
        if agent is None:
            return None
        latest_version = self.agents.latest_version_for(agent.id)
        if latest_version is None:
            latest_version = self.agents.create_version(
                agent.id,
                1,
                payload.pipeline_mode or "stt_llm_tts",
                routing_config={},
                vendor_config={},
            )
        routing_config = dict(latest_version.routing_config or {})
        vendor_config = dict(latest_version.vendor_config or {})
        if payload.description is not None:
            routing_config["description"] = payload.description
        if payload.segment is not None:
            routing_config["segment"] = payload.segment
        if payload.goal is not None:
            routing_config["goal"] = payload.goal
        if payload.flow_nodes is not None:
            routing_config["flow_nodes"] = [item.model_dump() for item in payload.flow_nodes]
        if payload.flow_edges is not None:
            routing_config["flow_edges"] = payload.flow_edges
        if payload.tools_catalog is not None:
            routing_config["tools_catalog"] = [item.model_dump() for item in payload.tools_catalog]
        if payload.knowledge_sources is not None:
            routing_config["knowledge_sources"] = [
                item.model_dump() for item in payload.knowledge_sources
            ]
        if payload.stack is not None:
            vendor_config["stack"] = payload.stack.model_dump()
        published_at = (
            datetime.now(UTC) if payload.status == "published" else latest_version.published_at
        )
        self.agents.update_definition(
            agent,
            agent_key=payload.agent_key,
            name=payload.name,
            status=payload.status,
        )
        self.agents.update_version(
            latest_version,
            pipeline_mode=payload.pipeline_mode,
            routing_config=routing_config,
            vendor_config=vendor_config,
            published_at=published_at,
        )
        refreshed = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent.id)
        logger.info("agent_definition.studio_updated", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return _to_record(refreshed)

    def delete_agent(self, tenant_slug: str, workspace_id, agent_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return False
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent_id)
        if agent is None:
            return False
        self.agents.delete_definition(agent)
        logger.info("agent_definition.deleted", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return True
