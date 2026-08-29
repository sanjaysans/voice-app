import asyncio
import inspect
import json
from collections.abc import Callable
from functools import partial
from importlib import import_module
from typing import Any

from livekit.agents import Agent, AgentSession, function_tool

from voice_pipeline.application.session_manifest import (
    build_runtime_plan_for_client_session,
    parse_session_request_metadata,
)
from voice_pipeline.config import Settings, get_settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.domain.workflow import WorkflowGraph
from voice_pipeline.infrastructure.livekit_providers import build_provider_bundle
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.logging import configure_logging, get_logger

_TERMINATION_TASKS: set[asyncio.Task[None]] = set()
SESSION_START_TIMEOUT_SECONDS = 45
SPEECH_TIMEOUT_SECONDS = 45


def load_livekit_sdk() -> dict[str, Any]:
    try:
        agents_module = import_module("livekit.agents")
    except ImportError as exc:  # pragma: no cover - depends on local package install state
        raise RuntimeError(
            "livekit-agents is not installed in the current environment. "
            "Run `uv sync --all-packages --all-groups` before starting the worker."
        ) from exc

    resolved = {
        "Agent": getattr(agents_module, "Agent", None),
        "AgentSession": getattr(agents_module, "AgentSession", None),
        "AutoSubscribe": getattr(agents_module, "AutoSubscribe", None),
        "JobContext": getattr(agents_module, "JobContext", None),
        "RoomInputOptions": getattr(agents_module, "RoomInputOptions", None),
        "WorkerOptions": getattr(agents_module, "WorkerOptions", None),
        "cli": getattr(agents_module, "cli", None),
    }
    missing_names = [name for name, value in resolved.items() if value is None]
    if missing_names:
        raise RuntimeError(
            "livekit-agents is installed but required runtime symbols are missing: "
            + ", ".join(missing_names)
        )
    return resolved


def build_worker_bootstrap(settings: Settings | None = None) -> dict[str, object]:
    resolved_settings = settings or get_settings()
    session_request = _default_session_request()
    plan = build_runtime_plan_for_client_session(resolved_settings, session_request)
    descriptor = LiveKitRuntimeValidator(resolved_settings).describe(plan)
    return {
        "runtime": descriptor.model_dump(mode="json"),
        "plan_valid": plan.is_valid,
        "plan_errors": plan.errors,
        "plan_warnings": plan.warnings,
        "bootstrap": LiveKitRuntimeValidator.to_bootstrap_metadata(plan, descriptor),
        "session": session_request.sanitized_summary(),
    }


def build_worker_options_kwargs(settings: Settings | None = None) -> dict[str, object]:
    resolved_settings = settings or get_settings()
    options: dict[str, object] = {
        "agent_name": resolved_settings.livekit_agent_name,
        "ws_url": resolved_settings.livekit_url,
        "api_key": resolved_settings.livekit_api_key,
        "api_secret": resolved_settings.livekit_api_secret,
        "log_level": resolved_settings.log_level,
    }
    if resolved_settings.environment != "prod":
        options.update(
            {
                "load_threshold": float("inf"),
            }
        )
    return options


def _default_session_request() -> ClientSessionRequest:
    placeholder_key = "client-supplied-placeholder"
    return ClientSessionRequest(
        stt={"api_key": placeholder_key},
        llm={"api_key": placeholder_key},
        tts={"api_key": placeholder_key},
    )


def _build_agent_instructions(session_request: ClientSessionRequest) -> str:
    lines = [
        "You are the Voice runtime agent.",
        session_request.prompt.system_prompt,
    ]
    return "\n".join(lines)


async def _speak(session: AgentSession, text: str, **kwargs: object) -> object:
    """Support LiveKit SDKs that return either a handle or an awaitable handle."""
    speech = session.say(text, **kwargs)
    if inspect.isawaitable(speech):
        return await asyncio.wait_for(speech, timeout=SPEECH_TIMEOUT_SECONDS)
    return speech


async def _maybe_await(value: object) -> object:
    if inspect.isawaitable(value):
        return await value
    return value


async def _publish_runtime_event(room: object | None, event_type: str, payload: dict[str, object]) -> None:
    if room is None:
        return
    local_participant = getattr(room, "local_participant", None)
    publish_data = getattr(local_participant, "publish_data", None)
    if publish_data is None:
        return
    try:
        result = publish_data(
            json.dumps({"event_type": event_type, **payload}).encode("utf-8"),
            reliable=True,
            topic="voice_runtime",
        )
        await _maybe_await(result)
    except Exception:
        return


async def _schedule_shutdown_after_speech(
    session: AgentSession,
    workflow: WorkflowGraph,
    speech: object,
) -> None:
    if hasattr(speech, "wait_for_playout"):
        await speech.wait_for_playout()
    workflow.mark_ended()
    await _maybe_await(session.shutdown(drain=False))


def _build_end_call_tool(session: AgentSession, workflow: WorkflowGraph, room: object | None = None):
    @function_tool(
        name="end_call",
        description=(
            "Use only when the workflow reaches its End call state. "
            "Provide the concise closing note to play once before termination."
        ),
    )
    async def end_call(note: str) -> str:
        if workflow.has_nodes and not workflow.is_terminal:
            return "End call is not permitted until the workflow reaches its End call state."
        if not workflow.begin_termination():
            return "The call has already ended."
        closing_note = note.strip() or "Thank you for your time. Goodbye."
        await _publish_runtime_event(room, "workflow.ended", {"state_id": workflow.current.node_id})
        speech = await _speak(session, closing_note, allow_interruptions=False)
        termination_task = asyncio.create_task(
            _schedule_shutdown_after_speech(session, workflow, speech)
        )
        _TERMINATION_TASKS.add(termination_task)
        termination_task.add_done_callback(_TERMINATION_TASKS.discard)
        return "The closing note was played and the call was terminated."

    return end_call


def _build_transition_tool(
    session: AgentSession,
    workflow: WorkflowGraph,
    agent_holder: dict[str, Agent | None],
    base_instructions: str,
    logger: Any,
    room: object | None = None,
):
    @function_tool(
        name="transition_to_state",
        description=(
            "Move the conversation to a configured next workflow state only after the caller's "
            "latest response satisfies that transition condition."
        ),
    )
    async def transition_to_state(next_state_id: str, reason: str = "") -> str:
        if not reason.strip():
            return (
                "Transition rejected: provide the evidence that satisfies the transition condition."
            )
        previous_state = workflow.current.node_id if workflow.current else None
        try:
            node = workflow.transition(next_state_id)
        except ValueError as exc:
            if str(exc) == "workflow transition limit reached":
                node = workflow.force_terminal()
                logger.warning(
                    "pipeline.workflow.transition_limit_reached",
                    from_state=previous_state,
                    to_state=node.node_id,
                )
                await _start_terminal_response(
                    session,
                    workflow,
                    "The conversation reached its safety limit. Generate a brief polite closing note and end the call now.",
                )
                return "Workflow safety limit reached. The call is being closed."
            return f"Transition rejected: {exc}"
        agent = agent_holder.get("agent")
        if agent is not None:
            await _maybe_await(
                agent.update_instructions(
                    f"{base_instructions}\n\n{workflow.current_instructions()}"
                )
            )
            await _maybe_await(session.update_agent(agent))
        logger.info(
            "pipeline.workflow.transitioned",
            from_state=previous_state,
            to_state=node.node_id,
            reason=reason,
            terminal=node.is_terminal,
        )
        await _publish_runtime_event(
            room,
            "workflow.transitioned",
            {
                "from_state": previous_state,
                "to_state": node.node_id,
                "reason": reason,
                "terminal": node.is_terminal,
            },
        )
        if node.is_terminal:
            await _start_terminal_response(
                session,
                workflow,
                "The workflow is complete. Generate a concise, polite closing note with the agreed next step, play it once, and end the call without waiting for another reply.",
            )
            return (
                "End call state reached. The closing note is being played and the call is ending."
            )
        return f"Active state is now {node.label}. Continue using its state prompt."

    return transition_to_state


async def _start_terminal_response(
    session: AgentSession,
    workflow: WorkflowGraph,
    instructions: str,
) -> None:
    if not workflow.begin_termination():
        return
    try:
        speech = session.generate_reply(
            instructions=instructions,
            allow_interruptions=False,
        )
        speech = await _maybe_await(speech)
    except (AttributeError, RuntimeError):
        speech = await _speak(
            session,
            "Thank you for your time. We have captured the next step. Goodbye.",
            allow_interruptions=False,
        )
    termination_task = asyncio.create_task(
        _schedule_shutdown_after_speech(session, workflow, speech)
    )
    _TERMINATION_TASKS.add(termination_task)
    termination_task.add_done_callback(_TERMINATION_TASKS.discard)


def _log_context(ctx: object) -> object:
    value = getattr(ctx, "log_context_fields", {})
    return value() if callable(value) else value


def _resolve_session_request(
    ctx: object,
    session_request: ClientSessionRequest | None = None,
) -> ClientSessionRequest:
    if session_request is not None:
        return session_request
    job = getattr(ctx, "job", None)
    metadata = getattr(job, "metadata", None)
    if isinstance(metadata, str) and metadata.strip():
        return parse_session_request_metadata(metadata)
    raise ValueError("client session metadata is required for the initial WebRTC flow")


def _session_close_future(session: object, room: object) -> asyncio.Future[dict[str, str]]:
    loop = asyncio.get_running_loop()
    close_future: asyncio.Future[dict[str, str]] = loop.create_future()

    def resolve_close(reason: str) -> None:
        if not close_future.done():
            close_future.set_result({"reason": reason})

    if hasattr(session, "on"):
        session.on("close", lambda *_args: resolve_close("session_closed"))
    if hasattr(room, "on"):
        room.on("disconnected", lambda *_args: resolve_close("room_disconnected"))

    return close_future


def _merge_turn_handling(
    bundle_turn_handling: dict[str, object], plan: object
) -> dict[str, object]:
    turn_policy = getattr(plan.blueprint, "turn_policy", None)
    if turn_policy is None:
        return dict(bundle_turn_handling)

    endpointing = dict(bundle_turn_handling.get("endpointing", {}))
    endpointing["min_delay"] = turn_policy.min_endpointing_ms / 1000
    endpointing["max_delay"] = turn_policy.max_endpointing_ms / 1000

    interruption = dict(bundle_turn_handling.get("interruption", {}))
    interruption["enabled"] = bool(turn_policy.allow_interruptions)
    interruption["resume_false_interruption"] = bool(turn_policy.false_interruption_recovery)

    return {
        **bundle_turn_handling,
        "endpointing": endpointing,
        "interruption": interruption,
    }


async def _run_worker_entrypoint(
    ctx: object,
    *,
    settings: Settings,
    session_request: ClientSessionRequest | None = None,
) -> None:
    configure_logging(settings.service_name, settings.log_level)
    logger = get_logger(__name__)
    sdk = load_livekit_sdk()
    resolved_request = _resolve_session_request(ctx, session_request)
    plan = build_runtime_plan_for_client_session(settings, resolved_request)
    runtime = LiveKitRuntimeValidator(settings).describe(plan)
    bootstrap = LiveKitRuntimeValidator.to_bootstrap_metadata(plan, runtime)
    logger.info(
        "pipeline.worker.entrypoint.start",
        session_id=resolved_request.session_id,
        room_name=resolved_request.room.room_name,
        startup_mode=runtime.startup_mode,
        selected_providers=bootstrap["providers"],
    )
    if not plan.is_valid or not runtime.configured:
        logger.error(
            "pipeline.worker.plan.invalid",
            errors=plan.errors,
            warnings=plan.warnings,
            runtime=runtime.model_dump(mode="json"),
        )
        return

    bundle = build_provider_bundle(resolved_request)
    turn_handling = _merge_turn_handling(bundle.turn_handling, plan)
    if hasattr(ctx, "connect"):
        await ctx.connect(
            auto_subscribe=sdk["AutoSubscribe"].SUBSCRIBE_ALL,
            single_peer_connection=True,
        )
        logger.info(
            "pipeline.worker.connected",
            room=getattr(getattr(ctx, "room", None), "name", None),
            worker_id=getattr(ctx, "worker_id", None),
        )

    session = AgentSession(
        stt=bundle.stt,
        llm=bundle.llm,
        tts=bundle.tts,
        vad=bundle.vad,
        turn_handling=turn_handling,
    )

    def on_remote_track_subscribed(
        track: object, publication: object, participant: object
    ) -> None:
        logger.info(
            "pipeline.worker.track.subscribed",
            participant=getattr(participant, "identity", None),
            source=getattr(publication, "source", None),
            track_kind=getattr(track, "kind", None),
        )

    def on_user_input_transcribed(event: object) -> None:
        transcript = str(getattr(event, "transcript", "") or "").strip()
        if transcript and bool(getattr(event, "is_final", False)):
            logger.info("pipeline.worker.stt.final", transcript=transcript)

    ctx.room.on("track_subscribed", on_remote_track_subscribed)
    session.on("user_input_transcribed", on_user_input_transcribed)
    close_future = _session_close_future(session, ctx.room)
    workflow = WorkflowGraph(resolved_request.workflow)
    base_instructions = _build_agent_instructions(resolved_request)
    agent_holder: dict[str, Agent | None] = {"agent": None}
    agent = Agent(
        instructions=f"{base_instructions}\n\n{workflow.current_instructions()}"
        if workflow.has_nodes
        else base_instructions,
        allow_interruptions=plan.blueprint.turn_policy.allow_interruptions,
        tools=[
            _build_end_call_tool(session, workflow, ctx.room),
            _build_transition_tool(
                session, workflow, agent_holder, base_instructions, logger, ctx.room
            ),
        ],
    )
    agent_holder["agent"] = agent
    await asyncio.wait_for(
        session.start(
            agent=agent,
            room=ctx.room,
            room_options=bundle.room_options,
        ),
        timeout=SESSION_START_TIMEOUT_SECONDS,
    )
    if resolved_request.prompt.opening_message:
        await _speak(session, resolved_request.prompt.opening_message)
    logger.info(
        "pipeline.worker.session.started",
        room=getattr(getattr(ctx, "room", None), "name", None),
        session_id=resolved_request.session_id,
        call_context=_log_context(ctx),
    )
    close_event = await close_future
    logger.info(
        "pipeline.worker.session.closed",
        room=getattr(getattr(ctx, "room", None), "name", None),
        session_id=resolved_request.session_id,
        close_reason=close_event["reason"],
    )


async def worker_entrypoint(ctx: object) -> None:
    await _run_worker_entrypoint(ctx, settings=get_settings())


def build_worker_entrypoint(
    settings: Settings | None = None,
    session_request: ClientSessionRequest | None = None,
) -> Callable[..., object]:
    resolved_settings = settings or get_settings()
    if session_request is None and resolved_settings == get_settings():
        return worker_entrypoint
    return partial(
        _run_worker_entrypoint,
        settings=resolved_settings,
        session_request=session_request,
    )


def main() -> None:
    sdk = load_livekit_sdk()
    settings = get_settings()
    worker_options = sdk["WorkerOptions"]
    cli_module = sdk["cli"]
    cli_module.run_app(
        worker_options(
            entrypoint_fnc=worker_entrypoint,
            **build_worker_options_kwargs(settings),
        )
    )
