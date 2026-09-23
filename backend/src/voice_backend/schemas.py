from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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
VariableDataType = Literal["text", "number", "boolean", "date", "datetime", "enum"]


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

    @model_validator(mode="after")
    def validate_vendor_config(self) -> AgentVersionCreateInput:
        if _contains_secret_key(self.vendor_config):
            raise ValueError("agent vendor configuration must reference provider accounts, not secrets")
        return self


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


class AgentVariableDefinition(BaseModel):
    key: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    data_type: VariableDataType = "text"
    required: bool = False
    default_value: object | None = None
    options: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_options(self) -> AgentVariableDefinition:
        self.options = [option.strip() for option in self.options if option.strip()]
        if self.data_type == "enum":
            if not self.options:
                raise ValueError(f"enum variable '{self.key}' must define at least one option")
            if len(self.options) != len(set(self.options)):
                raise ValueError(f"enum variable '{self.key}' contains duplicate options")
        elif self.options:
            raise ValueError(f"variable '{self.key}' only supports options when its type is enum")

        if self.default_value is not None:
            if self.data_type == "number":
                if isinstance(self.default_value, bool):
                    raise ValueError(f"number variable '{self.key}' has an invalid default")
                try:
                    float(self.default_value)
                except (TypeError, ValueError) as exc:
                    raise ValueError(
                        f"number variable '{self.key}' has an invalid default"
                    ) from exc
            elif self.data_type == "boolean" and not isinstance(self.default_value, bool):
                raise ValueError(f"boolean variable '{self.key}' has an invalid default")
            elif self.data_type == "enum" and self.default_value not in self.options:
                raise ValueError(f"variable '{self.key}' default must be one of its options")
            elif self.data_type == "date":
                try:
                    date.fromisoformat(str(self.default_value))
                except ValueError as exc:
                    raise ValueError(f"date variable '{self.key}' has an invalid default") from exc
            elif self.data_type == "datetime":
                try:
                    datetime.fromisoformat(str(self.default_value))
                except ValueError as exc:
                    raise ValueError(
                        f"datetime variable '{self.key}' has an invalid default"
                    ) from exc
        return self


class FlowNodeRecord(BaseModel):
    id: str
    label: str
    x: int
    y: int
    tone: Literal["neutral", "success", "warning"]
    node_type: Literal["state", "end_call"] = "state"
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
    variables: list[AgentVariableDefinition] = Field(default_factory=list)
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
    variables: list[AgentVariableDefinition] | None = None
    flow_nodes: list[FlowNodeRecord] | None = None
    flow_edges: list[FlowEdgeRecord] | None = None
    tools_catalog: list[AgentToolRecord] | None = None
    knowledge_sources: list[KnowledgeSourceRecord] | None = None
    pipeline_mode: PipelineMode | None = None

    @model_validator(mode="after")
    def validate_variable_keys(self) -> AgentStudioUpdateInput:
        if self.variables is not None:
            keys = [variable.key for variable in self.variables]
            if len(keys) != len(set(keys)):
                raise ValueError("agent variables must have unique keys")
        if self.runtime_profile is not None and _contains_secret_key(self.runtime_profile):
            raise ValueError("agent runtime configuration must reference provider accounts, not secrets")
        return self


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


EvalExecutionMode = Literal[
    "scripted_text",
    "text_chat",
    "simulated_text",
    "scripted_audio",
    "simulated_audio",
    "live_audio",
]
EvalSuiteStatus = Literal["draft", "active", "archived"]
EvalRunStatus = Literal["queued", "running", "scoring", "completed", "failed", "cancelled"]


class EvalAssertionInput(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    type: Literal[
        "contains",
        "not_contains",
        "regex",
        "outcome",
        "state_transition",
        "tool_call",
        "variable",
        "guardrail",
        "max_turns",
    ]
    expected: dict[str, object] = Field(default_factory=dict)
    critical: bool = False


class EvalMetricInput(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)
    weight: float = Field(default=1.0, gt=0, le=100)
    threshold: float = Field(default=0.7, ge=0, le=1)


def _contains_secret_key(value: object) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized_key = str(key).casefold().replace("-", "_")
            compact_key = normalized_key.replace("_", "")
            if compact_key in {
                "apikey",
                "apisecret",
                "password",
                "accesstoken",
                "authorization",
                "clientsecret",
                "secret",
                "token",
            } or normalized_key.endswith(("_password", "_secret", "_token")):
                return True
            if _contains_secret_key(item):
                return True
    elif isinstance(value, list):
        return any(_contains_secret_key(item) for item in value)
    return False


def redact_secret_fields(value: object) -> object:
    """Remove secret-shaped fields before agent configuration crosses a read boundary."""
    if isinstance(value, dict):
        return {
            str(key): redact_secret_fields(item)
            for key, item in value.items()
            if not _contains_secret_key({key: item})
        }
    if isinstance(value, list):
        return [redact_secret_fields(item) for item in value]
    return value


class EvalCaseCreateInput(BaseModel):
    case_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    scenario: dict[str, object] = Field(default_factory=dict)
    expected_behavior: dict[str, object] = Field(default_factory=dict)
    assertions: list[EvalAssertionInput] = Field(default_factory=list, max_length=50)
    rubric: list[EvalMetricInput] = Field(default_factory=list, max_length=20)
    caller_config: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_case_data(self) -> EvalCaseCreateInput:
        if any(
            _contains_secret_key(value)
            for value in (self.scenario, self.expected_behavior, self.caller_config)
        ):
            raise ValueError("evaluation case data must reference secrets, not contain them")
        return self


class EvalCaseUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    status: Literal["active", "archived"] | None = None
    scenario: dict[str, object] | None = None
    expected_behavior: dict[str, object] | None = None
    assertions: list[EvalAssertionInput] | None = Field(default=None, max_length=50)
    rubric: list[EvalMetricInput] | None = Field(default=None, max_length=20)
    caller_config: dict[str, object] | None = None

    @model_validator(mode="after")
    def validate_case_data(self) -> EvalCaseUpdateInput:
        if any(
            value is not None and _contains_secret_key(value)
            for value in (self.scenario, self.expected_behavior, self.caller_config)
        ):
            raise ValueError("evaluation case data must reference secrets, not contain them")
        return self


class EvalSuiteCreateInput(BaseModel):
    suite_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    agent_id: UUID
    status: EvalSuiteStatus = "draft"
    execution_defaults: dict[str, object] = Field(default_factory=dict)
    cases: list[EvalCaseCreateInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_execution_defaults(self) -> EvalSuiteCreateInput:
        if _contains_secret_key(self.execution_defaults):
            raise ValueError("execution defaults must reference secrets, not contain them")
        return self


class EvalSuiteUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    status: EvalSuiteStatus | None = None


class EvalRunCreateInput(BaseModel):
    execution_mode: EvalExecutionMode = "scripted_text"
    case_ids: list[UUID] | None = None
    repeat_count: int = Field(default=1, ge=1, le=10)
    fail_fast: bool = False


class EvalAssertionResultRecord(BaseModel):
    assertion_key: str
    assertion_type: str
    passed: bool
    critical: bool
    expected: dict[str, object]
    actual: dict[str, object]
    explanation: str


class EvalMetricResultRecord(BaseModel):
    metric_key: str
    score: float
    weight: float
    explanation: str
    judge_metadata: dict[str, object]


class EvalCaseRecord(BaseModel):
    case_id: UUID
    suite_id: UUID
    case_key: str
    name: str
    sort_order: int
    status: str
    version_number: int
    scenario: dict[str, object]
    expected_behavior: dict[str, object]
    assertions: list[EvalAssertionInput]
    rubric: list[EvalMetricInput]
    caller_config: dict[str, object]


class EvalSuiteRecord(BaseModel):
    suite_id: UUID
    tenant_id: UUID
    workspace_id: UUID
    agent_id: UUID
    suite_key: str
    name: str
    description: str
    status: EvalSuiteStatus
    latest_version_number: int
    agent_version_id: UUID
    case_count: int
    last_run_status: str | None
    last_run_score: float | None
    created_at: datetime
    updated_at: datetime


class EvalSuiteDetailRecord(EvalSuiteRecord):
    cases: list[EvalCaseRecord]


class EvalCaseRunRecord(BaseModel):
    case_run_id: UUID
    case_id: UUID
    case_name: str
    call_id: UUID | None
    status: str
    passed: bool | None
    score: float | None
    failure_summary: str
    evidence: dict[str, object]
    assertions: list[EvalAssertionResultRecord]
    metrics: list[EvalMetricResultRecord]


class EvalRunRecord(BaseModel):
    run_id: UUID
    suite_id: UUID
    suite_version_id: UUID
    execution_mode: EvalExecutionMode
    status: EvalRunStatus
    total_cases: int
    passed_cases: int
    failed_cases: int
    score: float | None
    summary: str
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    case_runs: list[EvalCaseRunRecord]


class EvalRunSummaryRecord(BaseModel):
    run_id: UUID
    suite_id: UUID
    suite_version_id: UUID
    execution_mode: EvalExecutionMode
    status: EvalRunStatus
    total_cases: int
    passed_cases: int
    failed_cases: int
    score: float | None
    summary: str
    created_at: datetime


class EvalCaseResultInput(BaseModel):
    execution_id: str = Field(min_length=1, max_length=160)
    evidence: dict[str, object] = Field(default_factory=dict)
    started_at: datetime | None = None
    ended_at: datetime | None = None


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
    lifecycle_status: (
        Literal["queued", "in_progress", "completed", "failed", "cancelled"] | None
    ) = None
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


class TextChatSessionCreateInput(BaseModel):
    agent_id: UUID
    variables: dict[str, object] = Field(default_factory=dict)


class TextChatMessageInput(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class TextChatTurnRecord(BaseModel):
    user_text: str
    assistant_text: str
    active_state_id: str | None = None
    active_state_label: str | None = None
    transitioned: bool = False
    transition_reason: str = ""
    ended: bool = False
    latency_ms: float
    model: str


class TextChatSessionRecord(BaseModel):
    call_id: UUID
    agent_id: UUID | None
    agent_name: str
    execution_mode: Literal["text_chat"] = "text_chat"
    lifecycle_status: Literal["in_progress", "completed", "failed", "cancelled"]
    active_state_id: str | None = None
    active_state_label: str | None = None
    model: str
    transcript: list[dict[str, str]] = Field(default_factory=list)
    event_log: list[dict[str, object]] = Field(default_factory=list)
    metrics: dict[str, object] = Field(default_factory=dict)
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime


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
    # Browser test rooms are disposable resources and must not survive a call.
    delete_room_on_close: bool = True


class BrowserRtcDeepgramInput(BaseModel):
    api_key: str
    model: str = "flux-general-en"
    language: str = "en-US"
    detect_language: bool = False
    interim_results: bool = True
    punctuate: bool = True
    smart_format: bool = True
    endpointing_ms: int = 400
    utterance_end_ms: int | None = None
    eager_eot_threshold: float | None = 0.35
    eot_threshold: float | None = 0.6
    eot_timeout_ms: int | None = 800
    keywords: list[str] = Field(default_factory=list)
    keyterms: list[str] = Field(default_factory=list)
    enable_diarization: bool = False


class BrowserRtcOpenAiInput(BaseModel):
    api_key: str
    model: str = "gpt-4.1-mini"
    temperature: float = 0.2
    max_output_tokens: int | None = 240
    service_tier: Literal["default", "priority"] = "default"
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
    min_silence_duration: float = 0.25
    prefix_padding_duration: float = 0.5
    max_buffered_speech: float = 60.0
    activation_threshold: float = 0.5
    sample_rate: Literal[8000, 16000] = 16000


class BrowserRtcSessionCreateInput(BaseModel):
    agent_id: UUID
    session_id: str | None = None
    pipeline_mode: PipelineMode = "stt_llm_tts"
    dispatch_agent_name: str = "voice-router-agent"
    room: BrowserRtcRoomInput = Field(default_factory=BrowserRtcRoomInput)
    vad: BrowserRtcVadInput = Field(default_factory=BrowserRtcVadInput)
    metadata: dict[str, str] = Field(default_factory=dict)
    variables: dict[str, object] = Field(default_factory=dict)
    participant_name: str | None = None


class BrowserRtcSessionResolvedInput(BaseModel):
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
    variables: dict[str, object] = Field(default_factory=dict)
    workflow: dict[str, object] = Field(default_factory=dict)
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
