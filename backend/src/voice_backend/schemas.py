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
WorkspaceRole = Literal["admin", "editor", "viewer"]


class TenantOverview(BaseModel):
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    workspace_count: int
    agent_count: int
    active_call_count: int
    total_call_count: int


class LoginInput(BaseModel):
    email: str
    password: str


class SessionUserRecord(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    is_platform_admin: bool


class SessionMembershipRecord(BaseModel):
    membership_id: UUID
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    workspace_id: UUID
    workspace_name: str
    workspace_is_default: bool
    role: WorkspaceRole


class SessionRecord(BaseModel):
    user: SessionUserRecord
    memberships: list[SessionMembershipRecord]
    active_membership: SessionMembershipRecord | None


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
    is_test: bool = False
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


class FlowEdgeRecord(BaseModel):
    id: str
    source_id: str
    target_id: str
    label: str
    condition: str


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
    shared_prompt: str = ""
    status: Literal["Draft", "Published", "Archived"]
    status_tone: Literal["warning", "success", "neutral"]
    last_edited: str
    segment: str
    goal: str
    stack: VendorStackRecord
    runtime_profile: dict[str, object] = Field(default_factory=dict)
    flow_nodes: list[FlowNodeRecord]
    flow_edges: list[FlowEdgeRecord]
    tools_catalog: list[AgentToolRecord]
    knowledge_sources: list[KnowledgeSourceRecord]
    latest_version_number: int | None
    latest_pipeline_mode: PipelineMode | None


class AgentStudioUpdateInput(BaseModel):
    agent_key: str | None = None
    name: str | None = None
    description: str | None = None
    shared_prompt: str | None = None
    status: AgentStatus | None = None
    segment: str | None = None
    goal: str | None = None
    stack: VendorStackRecord | None = None
    runtime_profile: dict[str, object] | None = None
    flow_nodes: list[FlowNodeRecord] | None = None
    flow_edges: list[FlowEdgeRecord] | None = None
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
    is_test: bool = False
    direction: str = "outbound"
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
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None


class CallLogListResponse(BaseModel):
    items: list[CallReviewRecord]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_previous: bool
    has_next: bool


class LiveTestSessionEventInput(BaseModel):
    event_type: str
    message: str
    occurred_at: datetime | None = None
    payload: dict[str, object] = Field(default_factory=dict)


class LiveTestSessionRecord(BaseModel):
    call_id: UUID
    agent_id: UUID | None
    agent_name: str
    is_test: bool = True
    lifecycle_status: Literal["queued", "in_progress", "completed", "failed", "cancelled"]
    room_name: str
    dispatch_id: str
    participant_identity: str
    participant_name: str
    vendor_trace: str
    summary: str
    outcome: str
    next_step: str
    synced_to_crm: bool
    transcript: list[dict[str, str]]
    extracted_variables: list[dict[str, str]]
    tool_calls: list[dict[str, str]]
    guardrails: list[str]
    metrics: dict[str, object] = Field(default_factory=dict)
    event_log: list[dict[str, object]] = Field(default_factory=list)
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime


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


class LiveTestSessionUpdateInput(BaseModel):
    lifecycle_status: Literal["queued", "in_progress", "completed", "failed", "cancelled"] | None = None
    display_status: Literal["Completed", "Follow-up", "Dropped"] | None = None
    summary: str | None = None
    outcome: str | None = None
    next_step: str | None = None
    synced_to_crm: bool | None = None
    transcript: list[dict[str, str]] | None = None
    extracted_variables: list[dict[str, str]] | None = None
    tool_calls: list[dict[str, str]] | None = None
    guardrails: list[str] | None = None
    metrics: dict[str, object] | None = None
    append_events: list[LiveTestSessionEventInput] = Field(default_factory=list)
    started_at: datetime | None = None
    ended_at: datetime | None = None


class WorkspaceAppState(BaseModel):
    workspace: WorkspaceRecord
    agents: list[AgentStudioRecord]
    connections: list[ConnectionRecord]
    provider_accounts: list[ProviderAccountRecord] = Field(default_factory=list)
    calls: list[CallReviewRecord]


class BrowserRtcPromptInput(BaseModel):
    system_prompt: str = Field(
        default=(
            "You are a helpful voice agent. Listen carefully, respond clearly, "
            "and confirm important details before closing the conversation."
        )
    )
    opening_message: str | None = None


class BrowserRtcRoomInput(BaseModel):
    room_name: str | None = None
    participant_identity: str | None = None
    text_input_enabled: bool = True
    audio_input_enabled: bool = True
    audio_output_enabled: bool = True
    text_output_enabled: bool = True
    sync_transcription: bool = True
    auto_gain_control: bool = True
    pre_connect_audio: bool = True
    close_on_disconnect: bool = True
    delete_room_on_close: bool = False


class BrowserRtcDeepgramInput(BaseModel):
    api_key: str
    model: str = "flux-general-en"
    language: str = "en-US"
    detect_language: bool = False
    interim_results: bool = True
    punctuate: bool = True
    smart_format: bool = True
    endpointing_ms: int = 25
    utterance_end_ms: int | None = None
    eager_eot_threshold: float | None = 0.4
    eot_threshold: float | None = None
    keywords: list[str] = Field(default_factory=list)
    keyterms: list[str] = Field(default_factory=list)
    enable_diarization: bool = False


class BrowserRtcOpenAiInput(BaseModel):
    api_key: str
    model: str = "gpt-4.1-mini"
    temperature: float = 0.2
    max_output_tokens: int | None = 500
    base_url: str | None = None
    user: str | None = None


class BrowserRtcCartesiaInput(BaseModel):
    api_key: str
    model: str = "sonic-3"
    voice: str = "f786b574-daa5-4673-aa0c-cbe3e8534c02"
    language: str = "en"
    speed: float | None = None
    emotion: str | list[str] | None = None
    volume: float | None = None
    sample_rate: int = 24000


class BrowserRtcVadInput(BaseModel):
    min_speech_duration: float = 0.05
    min_silence_duration: float = 0.55
    prefix_padding_duration: float = 0.5
    max_buffered_speech: float = 60.0
    activation_threshold: float = 0.5
    sample_rate: Literal[8000, 16000] = 16000


class BrowserRtcSessionCreateInput(BaseModel):
    agent_id: UUID
    session_id: str | None = None
    pipeline_mode: PipelineMode = "stt_llm_tts"
    dispatch_agent_name: str = "voice-router-agent"
    prompt: BrowserRtcPromptInput = Field(default_factory=BrowserRtcPromptInput)
    room: BrowserRtcRoomInput = Field(default_factory=BrowserRtcRoomInput)
    stt: BrowserRtcDeepgramInput
    llm: BrowserRtcOpenAiInput
    tts: BrowserRtcCartesiaInput
    vad: BrowserRtcVadInput = Field(default_factory=BrowserRtcVadInput)
    metadata: dict[str, str] = Field(default_factory=dict)
    participant_name: str | None = None


class BrowserRtcSessionRecord(BaseModel):
    call_id: UUID | None = None
    room_name: str
    participant_identity: str
    participant_name: str
    server_url: str
    access_token: str
    dispatch_id: str
    dispatch_agent_name: str
    session: dict[str, object]
    runtime: dict[str, object]
    warnings: list[str]
    errors: list[str]


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
