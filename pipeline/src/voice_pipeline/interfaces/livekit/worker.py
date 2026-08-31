import asyncio
import inspect
import json
import time
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
SESSION_SHUTDOWN_TIMEOUT_SECONDS = 10
RUNTIME_EVENT_TIMEOUT_SECONDS = 2


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


async def _shutdown_session(session: object) -> None:
    close = getattr(session, "aclose", None)
    if close is not None:
        try:
            await asyncio.wait_for(
                _maybe_await(close()), timeout=SESSION_SHUTDOWN_TIMEOUT_SECONDS
            )
            return
        except Exception as exc:
            get_logger(__name__).error(
                "pipeline.session.aclose_failed",
                error=str(exc),
            )
    shutdown = getattr(session, "shutdown", None)
    if shutdown is not None:
        try:
            await asyncio.wait_for(
                _maybe_await(shutdown(drain=False)), timeout=SESSION_SHUTDOWN_TIMEOUT_SECONDS
            )
        except Exception as exc:
            get_logger(__name__).error(
                "pipeline.session.shutdown_failed",
                error=str(exc),
            )


async def _shutdown_session_safely(session: object) -> None:
    shutdown_task = asyncio.create_task(_shutdown_session(session))
    try:
        await asyncio.shield(shutdown_task)
    except asyncio.CancelledError:
        await asyncio.shield(shutdown_task)
        raise


async def _publish_runtime_event(room: object | None, event_type: str, payload: dict[str, object]) -> None:
    if room is None:
        return
    local_participant = getattr(room, "local_participant", None)
    publish_data = getattr(local_participant, "publish_data", None)
    if publish_data is None:
        return
    for attempt in range(2):
        try:
            result = publish_data(
                json.dumps({"event_type": event_type, **payload}).encode("utf-8"),
                reliable=True,
                topic="voice_runtime",
            )
            await asyncio.wait_for(
                _maybe_await(result), timeout=RUNTIME_EVENT_TIMEOUT_SECONDS
            )
            return
        except Exception as exc:
            if attempt == 1:
                get_logger(__name__).warning(
                    "pipeline.runtime_event.publish_failed",
                    event_type=event_type,
                    error=str(exc),
                )
                return
            await asyncio.sleep(0.05)


async def _schedule_shutdown_after_speech(
    session: AgentSession,
    workflow: WorkflowGraph,
    speech: object,
    room: object | None = None,
) -> None:
    try:
        if hasattr(speech, "wait_for_playout"):
            await asyncio.wait_for(
                _maybe_await(speech.wait_for_playout()), timeout=SPEECH_TIMEOUT_SECONDS
            )
        await _drain_runtime_event_tasks(session)
        workflow.mark_ended()
        await _publish_runtime_event(room, "workflow.ended", {"state_id": workflow.current.node_id})
    finally:
        await _shutdown_session_safely(session)


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
        try:
            speech = await _speak(session, closing_note, allow_interruptions=False)
        except Exception as exc:
            get_logger(__name__).error("pipeline.workflow.closing_speech_failed", error=str(exc))
            await _shutdown_session_safely(session)
            raise
        termination_task = asyncio.create_task(
            _schedule_shutdown_after_speech(session, workflow, speech, room)
        )
        _TERMINATION_TASKS.add(termination_task)
        termination_task.add_done_callback(_handle_termination_task)
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
                    room,
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
                room,
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
    room: object | None = None,
) -> None:
    if not workflow.begin_termination():
        return
    try:
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
    except Exception as exc:
        get_logger(__name__).error("pipeline.workflow.closing_speech_failed", error=str(exc))
        workflow.mark_ended()
        await _publish_runtime_event(room, "workflow.ended", {"state_id": workflow.current.node_id})
        await _shutdown_session_safely(session)
        return
    termination_task = asyncio.create_task(
        _schedule_shutdown_after_speech(session, workflow, speech, room)
    )
    _TERMINATION_TASKS.add(termination_task)
    termination_task.add_done_callback(_handle_termination_task)


def _handle_termination_task(task: asyncio.Task[None]) -> None:
    _TERMINATION_TASKS.discard(task)
    if task.cancelled():
        return
    try:
        task.result()
    except Exception as exc:
        get_logger(__name__).error(
            "pipeline.workflow.termination_failed",
            error=str(exc),
        )


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
    endpointing_mode = getattr(turn_policy, "endpointing_mode", "dynamic")
    endpointing["mode"] = endpointing_mode
    if endpointing_mode == "fixed":
        fixed_delay = getattr(turn_policy, "endpointing_ms", 400) / 1000
        endpointing["min_delay"] = fixed_delay
        endpointing["max_delay"] = fixed_delay
    else:
        endpointing["min_delay"] = getattr(turn_policy, "min_endpointing_ms", 250) / 1000
        endpointing["max_delay"] = getattr(turn_policy, "max_endpointing_ms", 1_200) / 1000
    endpointing["alpha"] = float(getattr(turn_policy, "endpointing_alpha", 0.8))

    turn_detection = "stt" if getattr(turn_policy, "prefer_server_vad", True) else "vad"
    interruption = dict(bundle_turn_handling.get("interruption", {}))
    interruption["enabled"] = bool(turn_policy.allow_interruptions)
    interruption["mode"] = getattr(turn_policy, "interruption_mode", "vad")
    interruption["discard_audio_if_uninterruptible"] = bool(
        getattr(turn_policy, "discard_audio_if_uninterruptible", True)
    )
    sensitivity = getattr(turn_policy, "interruption_sensitivity", "balanced")
    sensitivity_min_duration = {"low": 0.5, "balanced": 0.35, "high": 0.2}.get(
        sensitivity, 0.35
    )
    configured_min_duration_ms = getattr(turn_policy, "min_interruption_duration_ms", 350)
    interruption["min_duration"] = (
        sensitivity_min_duration
        if configured_min_duration_ms == 350
        else configured_min_duration_ms / 1000
    )
    sensitivity_min_words = {"low": 2, "balanced": 1, "high": 1}.get(sensitivity, 1)
    configured_min_words = int(getattr(turn_policy, "min_interruption_words", 1))
    interruption["min_words"] = (
        sensitivity_min_words if configured_min_words == 1 else configured_min_words
    )
    interruption["resume_false_interruption"] = bool(turn_policy.false_interruption_recovery)
    interruption["false_interruption_timeout"] = (
        getattr(turn_policy, "false_interruption_timeout_ms", 1200) / 1000
    )
    interruption["backchannel_boundary"] = (
        getattr(turn_policy, "backchannel_boundary_ms", 800) / 1000
    )

    preemptive_generation = {
        "enabled": bool(getattr(turn_policy, "preemptive_generation", True)),
        "preemptive_tts": bool(getattr(turn_policy, "preemptive_tts", False)),
        "max_speech_duration": (
            getattr(turn_policy, "preemptive_max_speech_duration_ms", 10000) / 1000
        ),
        "max_retries": int(getattr(turn_policy, "preemptive_max_retries", 3)),
    }

    return {
        **bundle_turn_handling,
        "turn_detection": turn_detection,
        "endpointing": endpointing,
        "interruption": interruption,
        "preemptive_generation": preemptive_generation,
    }


def _streaming_runtime_payload(bundle: object) -> dict[str, object]:
    """Describe the media path without exposing provider credentials."""
    stt = getattr(bundle, "stt", None)
    llm = getattr(bundle, "llm", None)
    tts = getattr(bundle, "tts", None)
    stt_capabilities = getattr(stt, "capabilities", None)
    tts_capabilities = getattr(tts, "capabilities", None)
    llm_options = getattr(llm, "_opts", None)
    return {
        "stt": {
            "provider": type(stt).__name__,
            "model": getattr(stt, "model", None),
            "streaming": bool(getattr(stt_capabilities, "streaming", False)),
            "transport": "websocket",
        },
        "llm": {
            "provider": type(llm).__name__,
            "model": getattr(llm, "model", None),
            "streaming": bool(getattr(llm_options, "use_websocket", False)),
            "transport": "websocket",
        },
        "tts": {
            "provider": type(tts).__name__,
            "model": getattr(tts, "model", None),
            "streaming": bool(getattr(tts_capabilities, "streaming", False)),
            "transport": "websocket",
        },
    }


def _prewarm_streaming_providers(bundle: object) -> None:
    """Start provider websocket prewarming without delaying room connection."""
    tts = getattr(bundle, "tts", None)
    tts_prewarm = getattr(tts, "prewarm", None)
    if callable(tts_prewarm):
        tts_prewarm()

    # The Responses plugin currently exposes its pool internally, while Cartesia exposes
    # prewarm(). Keep this guarded so an SDK upgrade cannot prevent a call from starting.
    llm_pool = getattr(getattr(getattr(bundle, "llm", None), "_ws", None), "_pool", None)
    llm_prewarm = getattr(llm_pool, "prewarm", None)
    if callable(llm_prewarm):
        llm_prewarm()


def _schedule_runtime_event(
    room: object | None,
    pending_tasks: set[asyncio.Task[None]],
    event_type: str,
    payload: dict[str, object],
) -> None:
    if room is None:
        return
    publish_task = asyncio.create_task(_publish_runtime_event(room, event_type, payload))
    pending_tasks.add(publish_task)
    publish_task.add_done_callback(pending_tasks.discard)


def _register_turn_event_logging(
    session: AgentSession,
    logger: Any,
    scope: str,
    room: object | None = None,
) -> None:
    pending_publish_tasks: set[asyncio.Task[None]] = set()
    session._voice_runtime_event_tasks = pending_publish_tasks
    latest_eou: tuple[float, str | None] | None = None

    def publish_turn_event(event_type: str, payload: dict[str, object]) -> None:
        _schedule_runtime_event(room, pending_publish_tasks, event_type, payload)

    def log_state(event_name: str, event: object) -> None:
        nonlocal latest_eou
        payload = {
            "old_state": getattr(event, "old_state", None),
            "new_state": getattr(event, "new_state", None),
        }
        logger.info(f"{scope}.{event_name}", **payload)
        publish_turn_event(f"turn.{event_name}", payload)
        if (
            event_name == "agent_state_changed"
            and payload["new_state"] == "speaking"
            and latest_eou is not None
        ):
            eou_timestamp, speech_id = latest_eou
            latency_payload = {
                "metric_type": "response_latency",
                "speech_id": speech_id,
                "latency_seconds": max(0.0, time.time() - eou_timestamp),
                "budget_seconds": 2.0,
            }
            logger.info(f"{scope}.metrics", **latency_payload)
            publish_turn_event("turn.metrics", latency_payload)
            latest_eou = None

    def log_overlap(event: object) -> None:
        payload = {
            "is_interruption": getattr(event, "is_interruption", None),
            "agent_ended": getattr(event, "agent_ended", None),
            "total_duration": getattr(event, "total_duration", None),
            "prediction_duration": getattr(event, "prediction_duration", None),
            "detection_delay": getattr(event, "detection_delay", None),
        }
        logger.info(
            f"{scope}.overlapping_speech",
            **payload,
        )
        publish_turn_event("turn.overlapping_speech", payload)

    def log_false_interruption(event: object) -> None:
        payload = {"resumed": getattr(event, "resumed", None)}
        logger.info(
            f"{scope}.false_interruption",
            **payload,
        )
        publish_turn_event("turn.false_interruption", payload)

    def log_metrics(event: object) -> None:
        nonlocal latest_eou
        metrics = getattr(event, "metrics", event)
        payload: dict[str, object] = {
            "metric_type": getattr(metrics, "type", type(metrics).__name__),
        }
        for field in (
            "label",
            "speech_id",
            "end_of_utterance_delay",
            "transcription_delay",
            "on_user_turn_completed_delay",
            "ttft",
            "ttfb",
            "duration",
            "audio_duration",
            "acquire_time",
            "connection_reused",
            "cancelled",
            "completion_tokens",
            "prompt_tokens",
            "total_tokens",
            "characters_count",
            "streamed",
            "prompt_cached_tokens",
            "tokens_per_second",
            "input_tokens",
            "output_tokens",
        ):
            value = getattr(metrics, field, None)
            if isinstance(value, (bool, int, float, str)):
                payload[field] = value
        logger.info(f"{scope}.metrics", **payload)
        publish_turn_event("turn.metrics", payload)
        if payload["metric_type"] == "eou_metrics":
            timestamp = getattr(metrics, "timestamp", None)
            if isinstance(timestamp, (int, float)):
                latest_eou = (float(timestamp), payload.get("speech_id"))

    session.on("user_state_changed", lambda event: log_state("user_state_changed", event))
    session.on("agent_state_changed", lambda event: log_state("agent_state_changed", event))
    session.on("overlapping_speech", log_overlap)
    session.on("agent_false_interruption", log_false_interruption)
    session.on("metrics_collected", log_metrics)


async def _drain_runtime_event_tasks(session: AgentSession) -> None:
    pending_tasks = getattr(session, "_voice_runtime_event_tasks", set())
    while pending_tasks:
        await asyncio.gather(*tuple(pending_tasks), return_exceptions=True)


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
    _prewarm_streaming_providers(bundle)
    turn_handling = _merge_turn_handling(bundle.turn_handling, plan)
    session = AgentSession(
        stt=bundle.stt,
        llm=bundle.llm,
        tts=bundle.tts,
        vad=bundle.vad,
        turn_handling=turn_handling,
        # One tool action may be followed by one normal response, but a turn
        # must not fan out into an unbounded tool/generation chain.
        max_tool_steps=1,
    )
    if hasattr(ctx, "connect"):
        try:
            await ctx.connect(
                auto_subscribe=sdk["AutoSubscribe"].SUBSCRIBE_ALL,
                single_peer_connection=True,
            )
        except Exception:
            await _shutdown_session_safely(session)
            raise
        logger.info(
            "pipeline.worker.connected",
            room=getattr(getattr(ctx, "room", None), "name", None),
            worker_id=getattr(ctx, "worker_id", None),
        )

    def on_remote_track_subscribed(
        track: object, publication: object, participant: object
    ) -> None:
        payload = {
            "participant": getattr(participant, "identity", None),
            "source": getattr(publication, "source", None),
            "track_kind": getattr(track, "kind", None),
        }
        logger.info("pipeline.worker.track.subscribed", **payload)
        _schedule_runtime_event(
            ctx.room,
            getattr(session, "_voice_runtime_event_tasks", set()),
            "transport.track_subscribed",
            payload,
        )

    def on_user_input_transcribed(event: object) -> None:
        transcript = str(getattr(event, "transcript", "") or "").strip()
        if transcript and bool(getattr(event, "is_final", False)):
            payload = {"characters": len(transcript)}
            logger.info("pipeline.worker.stt.final", **payload)
            _schedule_runtime_event(
                ctx.room,
                getattr(session, "_voice_runtime_event_tasks", set()),
                "turn.stt_final",
                payload,
            )

    try:
        _register_turn_event_logging(session, logger, "pipeline.worker.turn", ctx.room)
        streaming_payload = _streaming_runtime_payload(bundle)
        logger.info("pipeline.worker.streaming.ready", layers=streaming_payload)
        _schedule_runtime_event(
            ctx.room,
            getattr(session, "_voice_runtime_event_tasks", set()),
            "transport.streaming_ready",
            streaming_payload,
        )
        _schedule_runtime_event(
            ctx.room,
            getattr(session, "_voice_runtime_event_tasks", set()),
            "transport.worker_connected",
            {"room": getattr(getattr(ctx, "room", None), "name", None)},
        )
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
        logger.info(
            "pipeline.worker.session.started",
            room=getattr(getattr(ctx, "room", None), "name", None),
            session_id=resolved_request.session_id,
            call_context=_log_context(ctx),
        )
        _schedule_runtime_event(
            ctx.room,
            getattr(session, "_voice_runtime_event_tasks", set()),
            "transport.session_started",
            {"session_id": resolved_request.session_id},
        )
        if resolved_request.prompt.opening_message:
            logger.info(
                "pipeline.worker.opening_speech.started",
                characters=len(resolved_request.prompt.opening_message),
            )
            await _speak(session, resolved_request.prompt.opening_message)
        close_event = await close_future
        logger.info(
            "pipeline.worker.session.closed",
            room=getattr(getattr(ctx, "room", None), "name", None),
            session_id=resolved_request.session_id,
            close_reason=close_event["reason"],
        )
        _schedule_runtime_event(
            ctx.room,
            getattr(session, "_voice_runtime_event_tasks", set()),
            "transport.session_closed",
            {"reason": close_event["reason"]},
        )
    finally:
        try:
            await _drain_runtime_event_tasks(session)
        finally:
            await _shutdown_session_safely(session)


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
