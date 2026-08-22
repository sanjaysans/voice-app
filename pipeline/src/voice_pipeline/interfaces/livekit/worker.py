from collections.abc import Callable
from functools import partial
from importlib import import_module
from typing import Any

from livekit.agents import Agent, AgentSession

from voice_pipeline.application.session_manifest import (
    build_runtime_plan_for_client_session,
    parse_session_request_metadata,
)
from voice_pipeline.config import Settings, get_settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.infrastructure.livekit_providers import build_provider_bundle
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.logging import configure_logging, get_logger


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
    return {
        "agent_name": resolved_settings.livekit_agent_name,
        "ws_url": resolved_settings.livekit_url,
        "api_key": resolved_settings.livekit_api_key,
        "api_secret": resolved_settings.livekit_api_secret,
        "log_level": resolved_settings.log_level,
    }


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
        turn_handling=bundle.turn_handling,
        allow_interruptions=plan.blueprint.turn_policy.allow_interruptions,
        min_endpointing_delay=plan.blueprint.turn_policy.min_endpointing_ms / 1000,
        max_endpointing_delay=plan.blueprint.turn_policy.max_endpointing_ms / 1000,
        resume_false_interruption=plan.blueprint.turn_policy.false_interruption_recovery,
    )
    agent = Agent(
        instructions=_build_agent_instructions(resolved_request),
        allow_interruptions=plan.blueprint.turn_policy.allow_interruptions,
    )
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=bundle.room_options,
    )
    if resolved_request.prompt.opening_message:
        await session.say(resolved_request.prompt.opening_message)
    logger.info(
        "pipeline.worker.session.started",
        room=getattr(getattr(ctx, "room", None), "name", None),
        session_id=resolved_request.session_id,
        call_context=_log_context(ctx),
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
