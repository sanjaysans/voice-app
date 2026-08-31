from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from time import perf_counter
from uuid import UUID

from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    ProviderAccountRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import (
    AgentVariableDefinition,
    BrowserRtcCartesiaInput,
    BrowserRtcDeepgramInput,
    BrowserRtcOpenAiInput,
    BrowserRtcPromptInput,
    BrowserRtcSessionCreateInput,
    BrowserRtcSessionRecord,
    BrowserRtcSessionResolvedInput,
    LiveTestSessionRecord,
    LiveTestSessionUpdateInput,
)
from voice_backend.secrets import decrypt_provider_config
from voice_backend.services.agent_config import normalize_flow_edges, normalize_flow_nodes

logger = get_logger(__name__)


def _status_label_from_lifecycle(lifecycle_status: str) -> str:
    return "Dropped" if lifecycle_status in {"failed", "cancelled"} else "Completed"


def _resolved_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _normalize_string(value: object, fallback: str = "") -> str:
    if isinstance(value, str):
        return value.strip() or fallback
    return fallback


def _coerce_uuid(value: object) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if not value:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _parse_csv_values(value: object) -> list[str]:
    if not isinstance(value, str):
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _coerce_bool(value: object, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return fallback


def _coerce_int(
    value: object,
    fallback: int,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    try:
        resolved = int(value)
    except (TypeError, ValueError):
        resolved = fallback

    if min_value is not None and resolved < min_value:
        return fallback
    if max_value is not None and resolved > max_value:
        return fallback
    return resolved


def _coerce_float(value: object, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _coerce_bounded_float(
    value: object,
    fallback: float,
    *,
    min_value: float,
    max_value: float,
) -> float:
    resolved = _coerce_float(value, fallback)
    if resolved < min_value or resolved > max_value:
        return fallback
    return resolved


def _resolve_browser_stt_model(value: object) -> str:
    """Keep browser calls on Deepgram's low-latency turn-aware stream."""
    model = _normalize_string(value, "flux-general-en").lower()
    if model.startswith("nova"):
        return "flux-general-en"
    return model


_VARIABLE_TOKEN_PATTERN = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")


def _normalize_variable_value(definition: AgentVariableDefinition, value: object) -> object:
    if definition.data_type == "text":
        return str(value)
    if definition.data_type == "number":
        try:
            return float(value) if "." in str(value) else int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"variable '{definition.key}' must be a number") from exc
    if definition.data_type == "boolean":
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
        raise ValueError(f"variable '{definition.key}' must be a boolean")
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"variable '{definition.key}' must be a non-empty string")
    normalized_value = value.strip()
    if definition.data_type == "date":
        try:
            date.fromisoformat(normalized_value)
        except ValueError as exc:
            raise ValueError(f"variable '{definition.key}' must be an ISO date") from exc
    if definition.data_type == "datetime":
        try:
            datetime.fromisoformat(normalized_value)
        except ValueError as exc:
            raise ValueError(f"variable '{definition.key}' must be an ISO datetime") from exc
    if definition.data_type == "enum" and normalized_value not in definition.options:
        raise ValueError(
            f"variable '{definition.key}' must be one of: {', '.join(definition.options)}"
        )
    return normalized_value


def _resolve_variable_inputs(raw_definitions: object, raw_values: object) -> dict[str, object]:
    definitions = []
    for raw_definition in raw_definitions if isinstance(raw_definitions, list) else []:
        try:
            definitions.append(AgentVariableDefinition.model_validate(raw_definition))
        except ValueError as exc:
            raise ValueError("agent variable definitions are invalid") from exc

    values = raw_values if isinstance(raw_values, dict) else {}
    definition_keys = [definition.key for definition in definitions]
    if len(definition_keys) != len(set(definition_keys)):
        raise ValueError("agent variable definitions contain duplicate keys")
    known_keys = set(definition_keys)
    unknown_keys = sorted(set(values) - known_keys)
    if unknown_keys:
        raise ValueError(f"unknown agent variables: {', '.join(unknown_keys)}")

    resolved: dict[str, object] = {}
    for definition in definitions:
        value = values.get(definition.key, definition.default_value)
        if value is None:
            if definition.required:
                raise ValueError(f"required agent variable '{definition.key}' is missing")
            continue
        resolved[definition.key] = _normalize_variable_value(definition, value)
    return resolved


def _render_prompt(text: str, variables: dict[str, object]) -> str:
    return _VARIABLE_TOKEN_PATTERN.sub(lambda match: str(variables.get(match.group(1), "")), text)


def _validate_prompt_variables(text: str, definitions: list[AgentVariableDefinition]) -> None:
    declared_keys = {definition.key for definition in definitions}
    unknown_keys = sorted(set(_VARIABLE_TOKEN_PATTERN.findall(text)) - declared_keys)
    if unknown_keys:
        raise ValueError("prompt references undeclared agent variables: " + ", ".join(unknown_keys))


def _render_workflow(
    flow_nodes: list[dict[str, object]],
    flow_edges: list[dict[str, object]],
    variables: dict[str, object],
) -> dict[str, list[dict[str, object]]]:
    nodes = []
    for node in flow_nodes:
        rendered = dict(node)
        rendered["state"] = _render_prompt(_normalize_string(node.get("state")), variables)
        rendered["prompt"] = _render_prompt(_normalize_string(node.get("prompt")), variables)
        nodes.append(rendered)
    edges = []
    for edge in flow_edges:
        rendered = dict(edge)
        rendered["condition"] = _render_prompt(_normalize_string(edge.get("condition")), variables)
        edges.append(rendered)
    return {"nodes": nodes, "edges": edges}


def _build_workflow_prompt(
    shared_prompt: str,
    description: str,
    flow_nodes,
    flow_edges,
    variable_definitions: object,
    variables: dict[str, object],
) -> str:
    raw_definitions = variable_definitions if isinstance(variable_definitions, list) else []
    definitions = [
        AgentVariableDefinition.model_validate(raw_definition) for raw_definition in raw_definitions
    ]
    _validate_prompt_variables(shared_prompt, definitions)
    variable_lines = []
    for definition in definitions:
        value = variables.get(definition.key, "not provided")
        variable_lines.append(
            f"- {definition.key} ({definition.data_type}, {definition.label}): {value}"
        )

    return "\n\n".join(
        part
        for part in [
            _render_prompt(shared_prompt, variables),
            f"Workflow purpose: {description}" if description else "",
            f"Call variables:\n{chr(10).join(variable_lines)}" if variable_lines else "",
            (
                "The runtime supplies the active workflow state and its valid transitions. "
                "Follow those instructions exactly and never invent a state."
                if flow_nodes
                else ""
            ),
        ]
        if part
    )


@dataclass(frozen=True)
class PreparedBrowserRtcSession:
    tenant_id: UUID
    workspace_id: UUID
    agent_version_id: UUID
    agent_name: str
    launch_number: str
    vendor_trace: str
    session_input: BrowserRtcSessionResolvedInput


def _build_live_test_session_record(call) -> LiveTestSessionRecord:
    resolved = call.resolved_config or {}
    agent = call.agent_version.agent_definition if call.agent_version is not None else None
    return LiveTestSessionRecord(
        call_id=call.id,
        agent_id=agent.id if agent is not None else None,
        agent_name=str(resolved.get("agent_name", agent.name if agent is not None else "Unknown")),
        lifecycle_status=str(resolved.get("lifecycle_status", call.status)),
        room_name=str(resolved.get("room_name", "")),
        dispatch_id=str(resolved.get("dispatch_id", "")),
        participant_identity=str(resolved.get("participant_identity", "")),
        participant_name=str(resolved.get("participant_name", "")),
        vendor_trace=str(resolved.get("vendor_trace", "")),
        summary=str(resolved.get("summary", "")),
        outcome=str(resolved.get("outcome", "")),
        next_step=str(resolved.get("next_step", "")),
        synced_to_crm=bool(resolved.get("synced_to_crm", False)),
        transcript=list(resolved.get("transcript", [])),
        extracted_variables=list(resolved.get("extracted_variables", [])),
        tool_calls=list(resolved.get("tool_calls", [])),
        guardrails=list(resolved.get("guardrails", [])),
        metrics=dict(resolved.get("metrics", {})),
        event_log=list(resolved.get("event_log", [])),
        started_at=call.started_at,
        ended_at=call.ended_at,
        created_at=call.created_at,
    )


class LiveTestSessionService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)
        self.provider_accounts = ProviderAccountRepository(session)

    def prepare_browser_session(
        self,
        tenant_slug: str,
        workspace_id,
        payload: BrowserRtcSessionCreateInput,
    ) -> PreparedBrowserRtcSession | None:
        started_at = perf_counter()
        dependencies = self.agents.get_browser_session_dependencies(
            tenant_slug, workspace_id, payload.agent_id
        )
        if dependencies is None:
            return None
        tenant, workspace, agent, latest_version = dependencies

        routing_config = dict(latest_version.routing_config or {})
        vendor_config = dict(latest_version.vendor_config or {})
        runtime_profile = dict(vendor_config.get("runtime_profile", {}))
        stack = vendor_config.get(
            "stack",
            {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "Cartesia"},
        )

        stt_profile = dict(runtime_profile.get("stt", {}))
        llm_profile = dict(runtime_profile.get("llm", {}))
        tts_profile = dict(runtime_profile.get("tts", {}))
        telephony_profile = dict(runtime_profile.get("telephony", {}))
        workflow_profile = dict(runtime_profile.get("workflow", {}))
        prompt_profile = dict(runtime_profile.get("prompt", {}))

        provider_account_ids = [
            stt_profile.get("providerAccountId"),
            llm_profile.get("providerAccountId"),
            tts_profile.get("providerAccountId"),
            telephony_profile.get("providerAccountId"),
        ]
        provider_accounts = self.provider_accounts.get_many_for_tenant(
            tenant.id, (account_id for account_id in provider_account_ids if account_id)
        )
        stt_account = provider_accounts.get(_coerce_uuid(stt_profile.get("providerAccountId")))
        llm_account = provider_accounts.get(_coerce_uuid(llm_profile.get("providerAccountId")))
        tts_account = provider_accounts.get(_coerce_uuid(tts_profile.get("providerAccountId")))
        telephony_account = (
            provider_accounts.get(_coerce_uuid(telephony_profile.get("providerAccountId")))
            if telephony_profile.get("providerAccountId")
            else None
        )
        if stt_account is None or llm_account is None or tts_account is None:
            return None

        stt_config = decrypt_provider_config(stt_account.config or {})
        llm_config = decrypt_provider_config(llm_account.config or {})
        tts_config = decrypt_provider_config(tts_account.config or {})
        telephony_config = (
            decrypt_provider_config(telephony_account.config or {}) if telephony_account else {}
        )
        stt_api_key = _normalize_string(stt_config.get("api_key"))
        llm_api_key = _normalize_string(llm_config.get("api_key"))
        tts_api_key = _normalize_string(tts_config.get("api_key"))
        if not stt_api_key or not llm_api_key or not tts_api_key:
            return None

        flow_nodes = normalize_flow_nodes(routing_config.get("flow_nodes", []))
        flow_edges = normalize_flow_edges(routing_config.get("flow_edges", []), flow_nodes)
        resolved_variables = _resolve_variable_inputs(
            routing_config.get("variables", []), payload.variables
        )
        variable_definitions = [
            AgentVariableDefinition.model_validate(item)
            for item in routing_config.get("variables", [])
            if isinstance(item, dict)
        ]
        _validate_prompt_variables(
            _normalize_string(prompt_profile.get("openingMessage")), variable_definitions
        )
        prompt = BrowserRtcPromptInput(
            system_prompt=_build_workflow_prompt(
                _normalize_string(routing_config.get("shared_prompt")),
                _normalize_string(routing_config.get("description")),
                flow_nodes,
                flow_edges,
                routing_config.get("variables", []),
                resolved_variables,
            )
            or BrowserRtcPromptInput().system_prompt,
            opening_message=(
                _render_prompt(
                    _normalize_string(prompt_profile.get("openingMessage")), resolved_variables
                )
                or None
            ),
        )
        rendered_workflow = _render_workflow(flow_nodes, flow_edges, resolved_variables)
        launch_number = _normalize_string(
            payload.metadata.get("launch_number")
        ) or _normalize_string(telephony_profile.get("phoneNumber"))
        if not launch_number:
            phone_numbers = _parse_csv_values(telephony_config.get("phone_numbers"))
            launch_number = phone_numbers[0] if phone_numbers else "browser-live"
        vendor_trace = (
            f"{_normalize_string(stack.get('stt'), 'Deepgram')} -> "
            f"{_normalize_string(stack.get('llm'), 'OpenAI')} -> "
            f"{_normalize_string(stack.get('tts'), 'Cartesia')}"
        )
        metadata = {
            **payload.metadata,
            "workspace": str(workspace.id),
            "agent_id": str(agent.id),
            "agent_name": agent.name,
            "vendor_trace": vendor_trace,
            "launch_number": launch_number,
        }

        prepared = PreparedBrowserRtcSession(
            tenant_id=tenant.id,
            workspace_id=workspace.id,
            agent_version_id=latest_version.id,
            agent_name=agent.name,
            launch_number=launch_number,
            vendor_trace=vendor_trace,
            session_input=BrowserRtcSessionResolvedInput(
                agent_id=agent.id,
                session_id=payload.session_id,
                pipeline_mode=payload.pipeline_mode,
                dispatch_agent_name=payload.dispatch_agent_name,
                prompt=prompt,
                room=payload.room,
                stt=BrowserRtcDeepgramInput(
                    api_key=stt_api_key,
                    model=_resolve_browser_stt_model(stt_profile.get("model")),
                    language=_normalize_string(stt_profile.get("language"), "en-US"),
                    keyterms=_parse_csv_values(stt_profile.get("keyterms")),
                    enable_diarization=_coerce_bool(
                        stt_profile.get("enableDiarization", False), False
                    ),
                    endpointing_ms=_coerce_int(
                        stt_profile.get("endpointingMs", 400),
                        400,
                        min_value=0,
                        max_value=1200,
                    ),
                    eager_eot_threshold=_coerce_bounded_float(
                        stt_profile.get("eagerEotThreshold", 0.35),
                        0.35,
                        min_value=0.0,
                        max_value=0.9,
                    ),
                    eot_threshold=_coerce_bounded_float(
                        stt_profile.get("eotThreshold", 0.6),
                        0.6,
                        min_value=0.5,
                        max_value=0.9,
                    ),
                    eot_timeout_ms=_coerce_int(
                        stt_profile.get("eotTimeoutMs", 800),
                        800,
                        min_value=100,
                        max_value=3000,
                    ),
                    utterance_end_ms=_coerce_int(
                        stt_profile.get("utteranceEndMs", 800),
                        800,
                        min_value=100,
                        max_value=3000,
                    ),
                    interim_results=_coerce_bool(stt_profile.get("interimResults", True), True),
                ),
                llm=BrowserRtcOpenAiInput(
                    api_key=llm_api_key,
                    model=_normalize_string(llm_profile.get("model"), "gpt-4.1-mini"),
                    temperature=_coerce_float(llm_profile.get("temperature", 0.2), 0.2),
                    max_output_tokens=_coerce_int(
                        llm_profile.get("maxOutputTokens", 240),
                        240,
                        min_value=64,
                        max_value=1000,
                    ),
                    service_tier=(
                        "priority" if llm_profile.get("priorityTier") == "priority" else "default"
                    ),
                ),
                tts=BrowserRtcCartesiaInput(
                    api_key=tts_api_key,
                    model=_normalize_string(tts_profile.get("model"), "sonic-3"),
                    voice=_normalize_string(tts_profile.get("voiceId")),
                    language=_normalize_string(tts_profile.get("language"), "en"),
                    speed=_coerce_float(tts_profile.get("speed", 1), 1),
                    emotion=_normalize_string(tts_profile.get("emotion"), "neutral"),
                    volume=_coerce_float(tts_profile.get("volume", 1), 1),
                    sample_rate=_coerce_int(
                        workflow_profile.get("sampleRate", 24000),
                        24000,
                        min_value=8000,
                        max_value=48000,
                    ),
                ),
                vad=payload.vad,
                metadata=metadata,
                variables=resolved_variables,
                workflow=rendered_workflow,
                participant_name=payload.participant_name,
            ),
        )
        logger.info(
            "live.session.prepare.completed",
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
            agent_id=str(agent.id),
        )
        return prepared

    def create_session_record(
        self,
        tenant_slug: str,
        workspace_id,
        payload: BrowserRtcSessionResolvedInput,
        session_record: BrowserRtcSessionRecord,
        *,
        launched_by: str,
        prepared: PreparedBrowserRtcSession | None = None,
    ) -> LiveTestSessionRecord | None:
        started_at = perf_counter()
        if prepared is None:
            tenant = self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                return None
            workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
            if workspace is None:
                return None
            agent = self.agents.get_definition_for_workspace(
                tenant.id, workspace.id, payload.agent_id
            )
            if agent is None:
                return None
            latest_version = agent.versions[-1] if agent.versions else None
            if latest_version is None:
                return None
            tenant_id = tenant.id
            resolved_workspace_id = workspace.id
            agent_name = agent.name
            agent_version_id = latest_version.id
        else:
            tenant_id = prepared.tenant_id
            resolved_workspace_id = prepared.workspace_id
            agent_name = prepared.agent_name
            agent_version_id = prepared.agent_version_id

        metadata = payload.metadata
        serialized_session = (
            session_record.model_dump() if hasattr(session_record, "model_dump") else {}
        )
        session_payload = getattr(session_record, "session", {}) or {}
        runtime_payload = getattr(session_record, "runtime", {}) or {}
        room_name = getattr(session_record, "room_name", serialized_session.get("room_name", ""))
        dispatch_id = getattr(
            session_record, "dispatch_id", serialized_session.get("dispatch_id", "")
        )
        participant_identity = getattr(
            session_record,
            "participant_identity",
            serialized_session.get("participant_identity", ""),
        )
        participant_name = getattr(
            session_record,
            "participant_name",
            serialized_session.get("participant_name", ""),
        )
        initial_summary = f"Browser live test prepared for {agent_name}."
        call = self.calls.create(
            tenant_id,
            resolved_workspace_id,
            direction="test",
            status="queued",
            is_test=True,
            agent_version_id=agent_version_id,
            from_number=str(metadata.get("launched_by", launched_by)),
            to_number=str(metadata.get("launch_number", "browser-live")),
            resolved_config={
                "is_test": True,
                "launch_source": "browser_live",
                "session_id": payload.session_id or session_payload.get("session_id", ""),
                "room_name": room_name,
                "dispatch_id": dispatch_id,
                "participant_identity": participant_identity,
                "participant_name": participant_name,
                "agent_name": agent_name,
                "scenario_name": "Browser live test",
                "status_label": "Completed",
                "lifecycle_status": "queued",
                "summary": initial_summary,
                "outcome": "Queued for live test",
                "next_step": "Join the room and speak with the agent.",
                "vendor_trace": str(metadata.get("vendor_trace", "")),
                "variables": payload.variables,
                "synced_to_crm": False,
                "extracted_variables": [],
                "tool_calls": [],
                "guardrails": [],
                "transcript": [],
                "metrics": {
                    "room_name": room_name,
                    "dispatch_id": dispatch_id,
                    "runtime_transport": runtime_payload.get("transport"),
                },
                "event_log": [
                    {
                        "event_type": "session_prepared",
                        "message": initial_summary,
                        "occurred_at": datetime.now(UTC).isoformat(),
                    }
                ],
            },
        )
        record = _build_live_test_session_record(call)
        logger.info(
            "live.session.persist.completed",
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
            call_id=str(call.id),
        )
        return record

    def update_session_record(
        self,
        tenant_slug: str,
        workspace_id,
        call_id,
        payload: LiveTestSessionUpdateInput,
    ) -> LiveTestSessionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id)
        if call is None or not call.is_test:
            return None

        resolved = dict(call.resolved_config or {})

        if payload.lifecycle_status is not None:
            resolved["lifecycle_status"] = payload.lifecycle_status
            resolved["status_label"] = payload.display_status or _status_label_from_lifecycle(
                payload.lifecycle_status
            )
            call_status = payload.lifecycle_status
        else:
            call_status = None

        if payload.summary is not None:
            resolved["summary"] = payload.summary
        if payload.outcome is not None:
            resolved["outcome"] = payload.outcome
        if payload.next_step is not None:
            resolved["next_step"] = payload.next_step
        if payload.synced_to_crm is not None:
            resolved["synced_to_crm"] = payload.synced_to_crm
        if payload.transcript is not None:
            current_transcript = list(resolved.get("transcript", []))
            if len(payload.transcript) >= len(current_transcript):
                resolved["transcript"] = payload.transcript
        if payload.extracted_variables is not None:
            resolved["extracted_variables"] = payload.extracted_variables
        if payload.tool_calls is not None:
            resolved["tool_calls"] = payload.tool_calls
        if payload.guardrails is not None:
            resolved["guardrails"] = payload.guardrails
        if payload.metrics is not None:
            resolved["metrics"] = {
                **dict(resolved.get("metrics", {})),
                **payload.metrics,
            }
        if payload.append_events:
            event_log = list(resolved.get("event_log", []))
            for event in payload.append_events:
                event_log.append(
                    {
                        "event_type": event.event_type,
                        "message": event.message,
                        "occurred_at": (
                            _resolved_timestamp(event.occurred_at) or datetime.now(UTC)
                        ).isoformat(),
                        "payload": event.payload,
                    }
                )
            resolved["event_log"] = event_log

        updated = self.calls.update(
            call,
            status=call_status,
            resolved_config=resolved,
            started_at=_resolved_timestamp(payload.started_at),
            ended_at=_resolved_timestamp(payload.ended_at),
        )
        return _build_live_test_session_record(updated)
