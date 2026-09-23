from __future__ import annotations

import json
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from voice_backend.models import Call
from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    ProviderAccountRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import (
    AgentVariableDefinition,
    TextChatMessageInput,
    TextChatSessionCreateInput,
    TextChatSessionRecord,
    TextChatTurnRecord,
)
from voice_backend.secrets import decrypt_provider_config
from voice_backend.services.agent_config import normalize_flow_edges, normalize_flow_nodes
from voice_backend.services.live_test_session import (
    _build_workflow_prompt,
    _normalize_string,
    _render_prompt,
    _render_workflow,
    _resolve_variable_inputs,
)


class TextChatSessionError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


def _event(
    event_type: str, message: str, payload: dict[str, object] | None = None
) -> dict[str, object]:
    return {
        "event_type": event_type,
        "message": message,
        "occurred_at": _now().isoformat(),
        "payload": payload or {},
    }


def _extract_response_text(payload: dict[str, object]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    output = payload.get("output")
    if isinstance(output, list):
        chunks: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                text = block.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        if chunks:
            return "".join(chunks).strip()
    raise TextChatSessionError("the LLM returned no text")


def _parse_turn(text: str) -> dict[str, object]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`").removeprefix("json").strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return {
            "reply": text.strip(),
            "next_state_id": None,
            "transition_reason": "",
            "end_call": False,
        }
    if not isinstance(parsed, dict):
        return {
            "reply": text.strip(),
            "next_state_id": None,
            "transition_reason": "",
            "end_call": False,
        }
    return {
        "reply": str(parsed.get("reply", "")).strip() or text.strip(),
        "next_state_id": parsed.get("next_state_id"),
        "transition_reason": str(parsed.get("transition_reason", "")).strip(),
        "end_call": bool(parsed.get("end_call", False)),
    }


def _state_by_id(workflow: dict[str, object], state_id: str | None) -> dict[str, object] | None:
    nodes = workflow.get("nodes", [])
    if not isinstance(nodes, list) or not state_id:
        return None
    return next(
        (node for node in nodes if isinstance(node, dict) and str(node.get("id")) == state_id),
        None,
    )


def _initial_state(workflow: dict[str, object]) -> dict[str, object] | None:
    nodes = workflow.get("nodes", [])
    edges = workflow.get("edges", [])
    if not isinstance(nodes, list):
        return None
    incoming = {
        str(edge.get("target_id"))
        for edge in edges
        if isinstance(edge, dict) and edge.get("target_id")
    }
    candidates = [
        node
        for node in nodes
        if isinstance(node, dict)
        and node.get("node_type") != "end_call"
        and str(node.get("id")) not in incoming
    ]
    return candidates[0] if candidates else next(
        (node for node in nodes if isinstance(node, dict) and node.get("node_type") != "end_call"),
        None,
    )


def _allowed_transition(
    workflow: dict[str, object], current_id: str | None, target_id: object
) -> dict[str, object] | None:
    edges = workflow.get("edges", [])
    if not isinstance(edges, list) or not current_id or not target_id:
        return None
    return next(
        (
            edge
            for edge in edges
            if isinstance(edge, dict)
            and str(edge.get("source_id")) == current_id
            and str(edge.get("target_id")) == str(target_id)
        ),
        None,
    )


def _record(call: Call) -> TextChatSessionRecord:
    resolved = dict(call.resolved_config or {})
    agent = call.agent_version.agent_definition if call.agent_version is not None else None
    active_state = _state_by_id(
        dict(resolved.get("workflow", {})),
        str(resolved.get("active_state_id")) if resolved.get("active_state_id") else None,
    )
    return TextChatSessionRecord(
        call_id=call.id,
        agent_id=agent.id if agent is not None else None,
        agent_name=str(resolved.get("agent_name", agent.name if agent else "Unknown")),
        lifecycle_status=str(resolved.get("lifecycle_status", call.status)),
        active_state_id=(
            str(resolved.get("active_state_id")) if resolved.get("active_state_id") else None
        ),
        active_state_label=str(active_state.get("label")) if active_state else None,
        model=str(resolved.get("llm", {}).get("model", "")),
        transcript=list(resolved.get("transcript", [])),
        event_log=list(resolved.get("event_log", [])),
        metrics=dict(resolved.get("metrics", {})),
        started_at=call.started_at,
        ended_at=call.ended_at,
        created_at=call.created_at,
    )


class TextChatService:
    """Run the agent brain without audio transport for manual and text eval tests."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)
        self.provider_accounts = ProviderAccountRepository(session)

    def create_session(
        self,
        tenant_slug: str,
        workspace_id,
        payload: TextChatSessionCreateInput,
        *,
        launched_by: str,
    ) -> TextChatSessionRecord | None:
        dependencies = self.agents.get_browser_session_dependencies(
            tenant_slug, workspace_id, payload.agent_id
        )
        if dependencies is None:
            return None
        tenant, workspace, agent, latest_version = dependencies
        routing_config = dict(latest_version.routing_config or {})
        vendor_config = dict(latest_version.vendor_config or {})
        runtime_profile = dict(vendor_config.get("runtime_profile", {}))
        llm_profile = dict(runtime_profile.get("llm", {}))
        llm_account_id = llm_profile.get("providerAccountId")
        llm_account = self.provider_accounts.get_for_tenant(tenant.id, llm_account_id)
        if llm_account is None:
            raise TextChatSessionError("the selected agent has no LLM connection")
        llm_config = decrypt_provider_config(llm_account.config or {})
        api_key = _normalize_string(llm_config.get("api_key"))
        if not api_key:
            raise TextChatSessionError("the selected LLM connection has no saved API key")

        flow_nodes = normalize_flow_nodes(routing_config.get("flow_nodes", []))
        flow_edges = normalize_flow_edges(routing_config.get("flow_edges", []), flow_nodes)
        variables = _resolve_variable_inputs(routing_config.get("variables", []), payload.variables)
        variable_definitions = [
            AgentVariableDefinition.model_validate(item)
            for item in routing_config.get("variables", [])
            if isinstance(item, dict)
        ]
        prompt_profile = dict(runtime_profile.get("prompt", {}))
        opening_message = _render_prompt(
            _normalize_string(prompt_profile.get("openingMessage")), variables
        ) or None
        workflow = _render_workflow(flow_nodes, flow_edges, variables)
        state = _initial_state(workflow)
        system_prompt = _build_workflow_prompt(
            _normalize_string(routing_config.get("shared_prompt")),
            _normalize_string(routing_config.get("description")),
            flow_nodes,
            flow_edges,
            [definition.model_dump(mode="json") for definition in variable_definitions],
            variables,
        )
        config = {
            "execution_mode": "text_chat",
            "agent_name": agent.name,
            "agent_version_id": str(latest_version.id),
            "system_prompt": system_prompt,
            "opening_message": opening_message,
            "workflow": workflow,
            "active_state_id": str(state.get("id")) if state else None,
            "variables": variables,
            "llm": {
                "provider_account_id": str(llm_account.id),
                "model": _normalize_string(llm_profile.get("model"), "gpt-4.1-mini"),
                "temperature": float(llm_profile.get("temperature", 0.2)),
                "max_output_tokens": int(llm_profile.get("maxOutputTokens", 240)),
                "service_tier": (
                    "priority" if llm_profile.get("priorityTier") == "priority" else "default"
                ),
            },
            "messages": [],
            "transcript": [],
            "event_log": [],
            "metrics": {"turn_count": 0, "execution_mode": "text_chat"},
            "lifecycle_status": "in_progress",
            "status_label": "Completed",
            "summary": f"Text chat test started for {agent.name}.",
            "outcome": "Text chat in progress",
            "next_step": "Send a message to test the agent prompt and workflow.",
            "synced_to_crm": False,
            "tool_calls": [],
            "guardrails": [],
            "extracted_variables": variables,
        }
        now = _now()
        if opening_message:
            config["messages"] = [{"role": "assistant", "text": opening_message}]
            config["transcript"] = [
                {"speaker": agent.name, "timestamp": now.isoformat(), "text": opening_message}
            ]
        config["event_log"] = [
            _event("session_prepared", config["summary"], {"model": config["llm"]["model"]})
        ]
        call = self.calls.create(
            tenant.id,
            workspace.id,
            direction="test",
            status="in_progress",
            is_test=True,
            agent_version_id=latest_version.id,
            from_number=launched_by,
            to_number="text-chat",
            resolved_config=config,
            started_at=now,
        )
        self.session.flush()
        return _record(call)

    async def send_message(
        self,
        tenant_slug: str,
        workspace_id,
        call_id: UUID,
        payload: TextChatMessageInput,
    ) -> TextChatTurnRecord:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            raise TextChatSessionError("text chat session not found")
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id) if workspace else None
        if (
            call is None
            or not call.is_test
            or (call.resolved_config or {}).get("execution_mode") != "text_chat"
        ):
            raise TextChatSessionError("text chat session not found")
        resolved = dict(call.resolved_config or {})
        if resolved.get("lifecycle_status") != "in_progress":
            raise TextChatSessionError("text chat session has already ended")
        llm = dict(resolved.get("llm", {}))
        account = self.provider_accounts.get_for_tenant(tenant.id, llm.get("provider_account_id"))
        if account is None:
            raise TextChatSessionError("the saved LLM connection is no longer available")
        api_key = _normalize_string(decrypt_provider_config(account.config or {}).get("api_key"))
        if not api_key:
            raise TextChatSessionError("the saved LLM connection has no usable API key")

        workflow = dict(resolved.get("workflow", {}))
        current_state_id = (
            str(resolved.get("active_state_id")) if resolved.get("active_state_id") else None
        )
        current_state = _state_by_id(workflow, current_state_id)
        transitions = [
            edge
            for edge in workflow.get("edges", [])
            if isinstance(edge, dict) and str(edge.get("source_id")) == str(current_state_id)
        ]
        state_context = {
            "active_state": current_state or {},
            "allowed_transitions": transitions,
        }
        instructions = (
            f"{resolved.get('system_prompt', '')}\n\n"
            f"Current workflow runtime context: {json.dumps(state_context, ensure_ascii=True)}\n\n"
            "You are running in text test mode. Return JSON only with this shape: "
            '{"reply":"string","next_state_id":null,"transition_reason":"string","end_call":false}. '
            "Use next_state_id only for a configured transition and include evidence in transition_reason. "
            "Set end_call true only when the conversation is complete or the End call state is active."
        )
        messages = list(resolved.get("messages", []))
        messages.append({"role": "user", "text": payload.text.strip()})
        request_input = [
            {"role": item["role"], "content": item["text"]}
            for item in messages
            if isinstance(item, dict) and item.get("role") in {"user", "assistant"}
        ]
        body = {
            "model": str(llm.get("model", "gpt-4.1-mini")),
            "instructions": instructions,
            "input": request_input,
            "temperature": float(llm.get("temperature", 0.2)),
            "max_output_tokens": int(llm.get("max_output_tokens", 240)),
            "service_tier": str(llm.get("service_tier", "default")),
            "store": False,
        }
        started = perf_counter()
        base_url = _normalize_string(
            decrypt_provider_config(account.config or {}).get("base_url"),
            "https://api.openai.com/v1",
        )
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    f"{base_url.rstrip('/')}/responses",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise TextChatSessionError(f"LLM request failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            raise TextChatSessionError(f"LLM request failed with status {response.status_code}")
        raw_text = _extract_response_text(response.json())
        turn = _parse_turn(raw_text)
        assistant_text = str(turn["reply"])
        target_id = str(turn["next_state_id"]) if turn.get("next_state_id") else None
        transition = _allowed_transition(workflow, current_state_id, target_id)
        transition_reason = str(turn.get("transition_reason", "")) if transition else ""
        transitioned = bool(transition)
        if transition:
            resolved["active_state_id"] = target_id
        next_state = _state_by_id(workflow, str(resolved.get("active_state_id")))
        ended = bool(turn.get("end_call")) or bool(next_state and next_state.get("node_type") == "end_call")
        now = _now()
        messages.append({"role": "assistant", "text": assistant_text})
        transcript = list(resolved.get("transcript", []))
        transcript.extend(
            [
                {"speaker": "You", "timestamp": now.isoformat(), "text": payload.text.strip()},
                {"speaker": str(resolved.get("agent_name", "Agent")), "timestamp": now.isoformat(), "text": assistant_text},
            ]
        )
        events = list(resolved.get("event_log", []))
        events.append(_event("turn.completed", "Text chat turn completed.", {"latency_ms": round((perf_counter() - started) * 1000, 2)}))
        if transitioned:
            events.append(_event("workflow.transitioned", "Workflow state changed.", {"from_state": current_state_id, "to_state": target_id, "reason": transition_reason}))
        resolved.update(
            {
                "messages": messages,
                "transcript": transcript,
                "event_log": events,
                "lifecycle_status": "completed" if ended else "in_progress",
                "summary": "Text chat test completed." if ended else resolved.get("summary", ""),
                "outcome": "Text chat completed" if ended else "Text chat in progress",
                "next_step": "Review the transcript and workflow events." if ended else "Continue the text conversation.",
                "metrics": {
                    **dict(resolved.get("metrics", {})),
                    "turn_count": len([item for item in messages if item.get("role") == "user"]),
                    "last_turn_latency_ms": round((perf_counter() - started) * 1000, 2),
                },
            }
        )
        self.calls.update(
            call,
            status="completed" if ended else "in_progress",
            resolved_config=resolved,
            ended_at=now if ended else None,
        )
        self.session.flush()
        return TextChatTurnRecord(
            user_text=payload.text.strip(),
            assistant_text=assistant_text,
            active_state_id=(
                str(resolved.get("active_state_id")) if resolved.get("active_state_id") else None
            ),
            active_state_label=str(next_state.get("label")) if next_state else None,
            transitioned=transitioned,
            transition_reason=transition_reason,
            ended=ended,
            latency_ms=round((perf_counter() - started) * 1000, 2),
            model=str(llm.get("model", "")),
        )

    def end_session(self, tenant_slug: str, workspace_id, call_id: UUID) -> TextChatSessionRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        call = self.calls.get_for_workspace(tenant.id, workspace.id, call_id) if workspace else None
        if call is None or not call.is_test or (call.resolved_config or {}).get("execution_mode") != "text_chat":
            return None
        resolved = dict(call.resolved_config or {})
        if resolved.get("lifecycle_status") == "in_progress":
            resolved.update(
                {
                    "lifecycle_status": "cancelled",
                    "summary": "Text chat test ended by the user.",
                    "outcome": "Text chat cancelled",
                    "next_step": "Start a new text chat test when ready.",
                    "event_log": [*list(resolved.get("event_log", [])), _event("session.ended", "Text chat test ended by the user.")],
                }
            )
            call = self.calls.update(call, status="cancelled", resolved_config=resolved, ended_at=_now())
            self.session.flush()
        return _record(call)
