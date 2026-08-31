from datetime import UTC, datetime

from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import AgentRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionRecord,
    AgentDefinitionUpdateInput,
    AgentStudioRecord,
    AgentStudioUpdateInput,
    AgentVersionCreateInput,
    AgentVersionRecord,
    redact_secret_fields,
)
from voice_backend.services.agent_config import normalize_flow_edges, normalize_flow_nodes
from voice_backend.services.read_cache import clear_read_cache, get_read_cache, set_read_cache

logger = get_logger(__name__)


def _normalized_routing_config(config: dict[str, object] | None) -> dict[str, object]:
    routing_config = dict(config or {})
    flow_nodes = normalize_flow_nodes(routing_config.get("flow_nodes", []))
    routing_config["flow_nodes"] = flow_nodes
    routing_config["flow_edges"] = normalize_flow_edges(
        routing_config.get("flow_edges", []), flow_nodes
    )
    return routing_config


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


def _to_version_record(version) -> AgentVersionRecord:
    return AgentVersionRecord(
        agent_version_id=version.id,
        version_number=version.version_number,
        pipeline_mode=version.pipeline_mode,
        routing_config=version.routing_config,
        vendor_config=redact_secret_fields(version.vendor_config),
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


def _to_studio_record(agent) -> AgentStudioRecord:
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
                routing_config=_normalized_routing_config(payload.initial_version.routing_config),
                vendor_config=payload.initial_version.vendor_config,
            )
        clear_read_cache()
        logger.info("agent_definition.created", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return _to_record(
            self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent.id)
        )

    def get_agent(self, tenant_slug: str, workspace_id, agent_id) -> AgentDefinitionRecord | None:
        cache_key = ("agent-definition.get", tenant_slug, str(workspace_id), str(agent_id))
        cached = get_read_cache(cache_key)
        if cached is not None:
            return cached

        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent_id)
        return set_read_cache(cache_key, _to_record(agent) if agent is not None else None)

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
        clear_read_cache()
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
            routing_config=_normalized_routing_config(payload.routing_config),
            vendor_config=payload.vendor_config,
        )
        refreshed = self.agents.get_definition_for_workspace(tenant.id, workspace.id, agent.id)
        clear_read_cache()
        logger.info("agent_version.created", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return _to_record(refreshed)

    def update_studio(
        self,
        tenant_slug: str,
        workspace_id,
        agent_id,
        payload: AgentStudioUpdateInput,
    ) -> AgentStudioRecord | None:
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
        routing_config = _normalized_routing_config(latest_version.routing_config)
        vendor_config = dict(latest_version.vendor_config or {})
        if payload.description is not None:
            routing_config["description"] = payload.description
        if payload.shared_prompt is not None:
            routing_config["shared_prompt"] = payload.shared_prompt
        if payload.segment is not None:
            routing_config["segment"] = payload.segment
        if payload.goal is not None:
            routing_config["goal"] = payload.goal
        if payload.variables is not None:
            routing_config["variables"] = [item.model_dump() for item in payload.variables]
        if payload.flow_nodes is not None:
            flow_nodes = normalize_flow_nodes([item.model_dump() for item in payload.flow_nodes])
            routing_config["flow_nodes"] = flow_nodes
            if payload.flow_edges is not None:
                routing_config["flow_edges"] = normalize_flow_edges(
                    [item.model_dump() for item in payload.flow_edges], flow_nodes
                )
        elif payload.flow_edges is not None:
            flow_nodes = normalize_flow_nodes(routing_config.get("flow_nodes", []))
            routing_config["flow_nodes"] = flow_nodes
            routing_config["flow_edges"] = normalize_flow_edges(
                [item.model_dump() for item in payload.flow_edges], flow_nodes
            )
        if payload.tools_catalog is not None:
            routing_config["tools_catalog"] = [item.model_dump() for item in payload.tools_catalog]
        if payload.knowledge_sources is not None:
            routing_config["knowledge_sources"] = [
                item.model_dump() for item in payload.knowledge_sources
            ]
        if payload.stack is not None:
            vendor_config["stack"] = payload.stack.model_dump()
        if payload.runtime_profile is not None:
            vendor_config["runtime_profile"] = payload.runtime_profile
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
        clear_read_cache()
        logger.info(
            "agent_definition.studio_updated", tenant_id=str(tenant.id), agent_id=str(agent.id)
        )
        return _to_studio_record(refreshed)

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
        clear_read_cache()
        logger.info("agent_definition.deleted", tenant_id=str(tenant.id), agent_id=str(agent.id))
        return True
