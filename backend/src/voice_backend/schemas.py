from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TenantStatus = Literal["active", "paused", "archived"]
AgentStatus = Literal["draft", "published", "archived"]
ProviderAccountStatus = Literal["draft", "active", "inactive", "error", "configured"]
ProviderKind = Literal[
    "stt",
    "llm",
    "tts",
    "telephony",
    "crm",
    "calendar",
    "knowledge",
    "webhook",
]
PipelineMode = Literal["realtime_s2s", "stt_llm_tts", "stt_llm", "llm_tts"]


class TenantOverview(BaseModel):
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    workspace_count: int
    agent_count: int
    active_call_count: int
    total_call_count: int


class AgentSummary(BaseModel):
    agent_id: UUID
    workspace_id: UUID
    agent_key: str
    name: str
    status: str
    latest_version_number: int | None
    latest_pipeline_mode: str | None


class CallSummary(BaseModel):
    call_id: UUID
    workspace_id: UUID
    agent_name: str | None
    direction: str
    status: str
    from_number: str | None
    to_number: str | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime


class TenantRecord(BaseModel):
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    status: TenantStatus
    created_at: datetime


class TenantCreateInput(BaseModel):
    slug: str
    name: str
    status: TenantStatus = "active"


class TenantUpdateInput(BaseModel):
    slug: str | None = None
    name: str | None = None
    status: TenantStatus | None = None


class WorkspaceRecord(BaseModel):
    workspace_id: UUID
    tenant_id: UUID
    name: str
    is_default: bool
    created_at: datetime


class WorkspaceCreateInput(BaseModel):
    name: str
    is_default: bool = False


class WorkspaceUpdateInput(BaseModel):
    name: str | None = None
    is_default: bool | None = None


class ProviderAccountRecord(BaseModel):
    provider_account_id: UUID
    tenant_id: UUID
    provider_kind: ProviderKind
    vendor_name: str
    label: str
    status: ProviderAccountStatus
    has_config: bool
    config_keys: list[str]
    preview: dict[str, object]
    created_at: datetime
    updated_at: datetime


class ProviderAccountCreateInput(BaseModel):
    provider_kind: ProviderKind
    vendor_name: str
    label: str
    status: ProviderAccountStatus = "draft"
    config: dict[str, object] = Field(default_factory=dict)


class ProviderAccountUpdateInput(BaseModel):
    provider_kind: ProviderKind | None = None
    vendor_name: str | None = None
    label: str | None = None
    status: ProviderAccountStatus | None = None
    config: dict[str, object] | None = None


class AgentVersionRecord(BaseModel):
    agent_version_id: UUID
    version_number: int
    pipeline_mode: PipelineMode
    routing_config: dict[str, object]
    vendor_config: dict[str, object]
    published_at: datetime | None
    created_at: datetime


class AgentVersionCreateInput(BaseModel):
    pipeline_mode: PipelineMode
    routing_config: dict[str, object] = Field(default_factory=dict)
    vendor_config: dict[str, object] = Field(default_factory=dict)


class AgentDefinitionRecord(BaseModel):
    agent_id: UUID
    tenant_id: UUID
    workspace_id: UUID
    agent_key: str
    name: str
    status: AgentStatus
    created_at: datetime
    updated_at: datetime
    versions: list[AgentVersionRecord]
    latest_version: AgentVersionRecord | None


class AgentDefinitionCreateInput(BaseModel):
    agent_key: str
    name: str
    status: AgentStatus = "draft"
    initial_version: AgentVersionCreateInput | None = None


class AgentDefinitionUpdateInput(BaseModel):
    agent_key: str | None = None
    name: str | None = None
    status: AgentStatus | None = None


class VendorStackRecord(BaseModel):
    stt: str
    llm: str
    tts: str


class FlowNodeRecord(BaseModel):
    id: str
    label: str
    x: int
    y: int
    tone: Literal["neutral", "success", "warning"]
    state: str
    prompt: str
    tools: list[str]
    knowledge: list[str]
    vendors: VendorStackRecord


class AgentToolRecord(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool


class KnowledgeSourceRecord(BaseModel):
    id: str
    name: str
    description: str
    status: Literal["Connected", "Syncing"]
    enabled: bool


class AgentStudioRecord(BaseModel):
    agent_id: UUID
    workspace_id: UUID
    agent_key: str
    name: str
    description: str
    status: Literal["Draft", "Published", "Archived"]
    status_tone: Literal["warning", "success", "neutral"]
    last_edited: str
    segment: str
    goal: str
    stack: VendorStackRecord
    flow_nodes: list[FlowNodeRecord]
    flow_edges: list[tuple[str, str]]
    tools_catalog: list[AgentToolRecord]
    knowledge_sources: list[KnowledgeSourceRecord]
    latest_version_number: int | None
    latest_pipeline_mode: PipelineMode | None


class AgentStudioUpdateInput(BaseModel):
    agent_key: str | None = None
    name: str | None = None
    description: str | None = None
    status: AgentStatus | None = None
    segment: str | None = None
    goal: str | None = None
    stack: VendorStackRecord | None = None
    flow_nodes: list[FlowNodeRecord] | None = None
    flow_edges: list[tuple[str, str]] | None = None
    tools_catalog: list[AgentToolRecord] | None = None
    knowledge_sources: list[KnowledgeSourceRecord] | None = None
    pipeline_mode: PipelineMode | None = None


class ConnectionRecord(BaseModel):
    provider_account_id: UUID
    category: Literal["Telephony", "CRM", "Calendar", "Knowledge"]
    name: str
    vendor: str
    description: str
    status: Literal["Connected", "Needs setup", "Warning"]
    tone: Literal["neutral", "success", "warning"]
    detail: str
    last_checked: str


class CallReviewRecord(BaseModel):
    call_id: UUID
    agent_id: UUID | None
    agent_name: str
    lead_name: str
    company: str
    phone: str
    scenario_name: str
    status: Literal["Completed", "Follow-up", "Dropped"]
    status_tone: Literal["success", "warning", "danger"]
    duration: str
    time: str
    summary: str
    outcome: str
    next_step: str
    vendor_trace: str
    synced_to_crm: bool
    extracted_variables: list[dict[str, str]]
    tool_calls: list[dict[str, str]]
    guardrails: list[str]
    transcript: list[dict[str, str]]


class CallReviewCreateInput(BaseModel):
    agent_id: UUID
    lead_name: str
    company: str
    phone: str
    scenario_name: str
    status: Literal["Completed", "Follow-up", "Dropped"]
    duration: str
    summary: str
    outcome: str
    next_step: str
    vendor_trace: str
    synced_to_crm: bool = False
    extracted_variables: list[dict[str, str]] = Field(default_factory=list)
    tool_calls: list[dict[str, str]] = Field(default_factory=list)
    guardrails: list[str] = Field(default_factory=list)
    transcript: list[dict[str, str]] = Field(default_factory=list)


class CallReviewUpdateInput(BaseModel):
    synced_to_crm: bool | None = None
    next_step: str | None = None
    status: Literal["Completed", "Follow-up", "Dropped"] | None = None


class WorkspaceAppState(BaseModel):
    workspace: WorkspaceRecord
    agents: list[AgentStudioRecord]
    connections: list[ConnectionRecord]
    calls: list[CallReviewRecord]


class TeamMemberRecord(BaseModel):
    membership_id: UUID
    user_id: UUID
    workspace_id: UUID
    email: str
    display_name: str
    role: Literal["admin", "editor", "viewer"]
    created_at: datetime


class TeamMemberCreateInput(BaseModel):
    email: str
    display_name: str
    role: Literal["admin", "editor", "viewer"] = "viewer"


class TeamMemberUpdateInput(BaseModel):
    display_name: str | None = None
    role: Literal["admin", "editor", "viewer"] | None = None
