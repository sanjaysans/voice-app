from __future__ import annotations

import asyncio
import json
import re
import wave
from pathlib import Path

import httpx
from livekit import rtc
from livekit.agents import Agent, AgentSession, function_tool

from voice_pipeline.application.session_manifest import (
    build_runtime_plan_for_client_session,
    parse_session_request_metadata,
)
from voice_pipeline.config import Settings, get_settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.infrastructure.livekit_providers import build_provider_bundle
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.interfaces.livekit.worker import (
    SESSION_START_TIMEOUT_SECONDS,
    _maybe_await,
    _merge_turn_handling,
    _session_close_future,
    _speak,
    load_livekit_sdk,
)
from voice_pipeline.logging import configure_logging, get_logger

MAX_AGENT_TURNS = 8
CALLER_CASE_TIMEOUT_SECONDS = 120


def _recording_filename(execution_id: str) -> str:
    safe_execution_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", execution_id).strip("-")
    return f"eval-{safe_execution_id}.wav"


def _text_from_item(event: object) -> str:
    item = getattr(event, "item", None)
    return str(getattr(item, "raw_text_content", "") or "").strip()


def _item_role(event: object) -> str:
    item = getattr(event, "item", None)
    return str(getattr(item, "role", "") or "").lower().strip()


def _runtime_event(packet: object) -> dict[str, object] | None:
    try:
        value = json.loads(bytes(getattr(packet, "data", b"")).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _resolve_request(ctx: object) -> ClientSessionRequest:
    metadata = getattr(getattr(ctx, "job", None), "metadata", "")
    if not isinstance(metadata, str) or not metadata.strip():
        raise ValueError("evaluation caller metadata is required")
    return parse_session_request_metadata(metadata)


def _build_caller_agent(session: AgentSession, request: ClientSessionRequest, finished: asyncio.Event):
    @function_tool(
        name="finish_eval_case",
        description="Mark the evaluation case complete after the production agent has finished the call.",
    )
    async def finish_eval_case(outcome: str = "", notes: str = "") -> str:
        if not finished.is_set():
            finished.set()
        return "The evaluation case was recorded. Do not speak again."

    return Agent(
        instructions=request.prompt.system_prompt,
        allow_interruptions=True,
        tools=[finish_eval_case],
    )


async def _post_evidence(request: ClientSessionRequest, evidence: dict[str, object], settings: Settings) -> None:
    callback_url = request.metadata.get("evaluation_callback_url")
    execution_id = request.metadata.get("evaluation_execution_id")
    if not callback_url or not execution_id:
        raise ValueError("evaluation callback metadata is incomplete")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            callback_url,
            headers={"X-Voice-Internal-Key": settings.internal_api_key},
            json={"execution_id": execution_id, "evidence": evidence},
        )
        if response.is_error:
            raise RuntimeError(
                f"evaluation callback failed with status {response.status_code}: "
                f"{response.text[:500]}"
            )


async def _run_caller(ctx: object, settings: Settings) -> None:
    logger = get_logger(__name__)
    sdk = load_livekit_sdk()
    request = _resolve_request(ctx)
    logger.info(
        "pipeline.eval_caller.entrypoint.start",
        room=getattr(getattr(ctx, "room", None), "name", None),
        execution_id=request.metadata.get("evaluation_execution_id"),
    )
    plan = build_runtime_plan_for_client_session(settings, request)
    runtime = LiveKitRuntimeValidator(settings).describe(plan)
    if not plan.is_valid or not runtime.configured:
        raise ValueError("evaluation caller runtime is not configured")
    await ctx.connect(
        auto_subscribe=sdk["AutoSubscribe"].SUBSCRIBE_ALL,
        single_peer_connection=True,
    )
    logger.info(
        "pipeline.eval_caller.connected",
        room=getattr(getattr(ctx, "room", None), "name", None),
    )
    logger.info("pipeline.eval_caller.providers.start")
    bundle = build_provider_bundle(request)
    logger.info("pipeline.eval_caller.providers.ready")
    session = AgentSession(
        stt=bundle.stt,
        llm=bundle.llm,
        tts=bundle.tts,
        vad=bundle.vad,
        turn_handling=_merge_turn_handling(bundle.turn_handling, plan),
        max_tool_steps=1,
    )
    transcript: list[dict[str, object]] = []
    transitions: list[dict[str, object]] = []
    finished = asyncio.Event()
    turn_limit_reached = asyncio.Event()
    agent_turn_count = 0
    recording_path = None
    recording_task: asyncio.Task[None] | None = None

    def on_remote_track_subscribed(
        track: object, publication: object, participant: object
    ) -> None:
        nonlocal recording_task, recording_path
        logger.info(
            "pipeline.eval_caller.track.subscribed",
            participant=getattr(participant, "identity", None),
            source=getattr(publication, "source", None),
            track_kind=getattr(track, "kind", None),
        )
        track_kind = getattr(track, "kind", "")
        track_kind_name = str(track_kind).lower()
        if isinstance(track_kind, int):
            try:
                track_kind_name = rtc.TrackKind.Name(track_kind).lower()
            except ValueError:
                pass
        if recording_task is not None or "audio" not in track_kind_name:
            return
        recording_path = str(
            Path(settings.recordings_dir)
            / _recording_filename(
                str(request.metadata.get("evaluation_execution_id", "evaluation"))
            )
        )
        Path(recording_path).parent.mkdir(parents=True, exist_ok=True)

        async def record_track() -> None:
            stream = rtc.AudioStream.from_track(
                track=track,
                sample_rate=48000,
                num_channels=1,
                frame_size_ms=20,
            )
            try:
                with wave.open(recording_path, "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(48000)
                    async for frame_event in stream:
                        output.writeframes(bytes(frame_event.frame.data))
            finally:
                await stream.aclose()

        recording_task = asyncio.create_task(record_track())

    def on_agent_transcript(event: object) -> None:
        nonlocal agent_turn_count
        text = str(getattr(event, "transcript", "") or "").strip()
        if text and bool(getattr(event, "is_final", False)):
            logger.info("pipeline.eval_caller.stt.final", transcript=text)
            transcript.append({"speaker": "agent", "text": text})
            agent_turn_count += 1
            if agent_turn_count >= MAX_AGENT_TURNS:
                logger.warning(
                    "pipeline.eval_caller.turn_limit_reached",
                    max_agent_turns=MAX_AGENT_TURNS,
                )
                turn_limit_reached.set()

    def on_caller_speech(event: object) -> None:
        role = _item_role(event)
        if role in {"system", "tool"}:
            return
        text = _text_from_item(event)
        if text and (
            not transcript
            or transcript[-1].get("speaker") != "caller"
            or transcript[-1].get("text") != text
        ):
            transcript.append({"speaker": "caller", "text": text})

    def on_room_data(packet: object) -> None:
        event = _runtime_event(packet)
        if event and event.get("event_type") == "workflow.transitioned":
            transitions.append(event)
        if event and event.get("event_type") == "workflow.ended":
            finished.set()

    session.on("user_input_transcribed", on_agent_transcript)
    session.on("conversation_item_added", on_caller_speech)
    ctx.room.on("track_subscribed", on_remote_track_subscribed)
    ctx.room.on("data_received", on_room_data)
    close_future = _session_close_future(session, ctx.room)
    agent = _build_caller_agent(session, request, finished)
    logger.info("pipeline.eval_caller.session.starting")
    await asyncio.wait_for(
        session.start(agent=agent, room=ctx.room, room_options=bundle.room_options),
        timeout=SESSION_START_TIMEOUT_SECONDS,
    )
    logger.info("pipeline.eval_caller.session.ready")
    initial_utterance = request.prompt.opening_message or "Hello, I am calling about the service."
    await _speak(session, initial_utterance, allow_interruptions=False)
    logger.info(
        "pipeline.eval_caller.session.started",
        room=getattr(ctx.room, "name", None),
        execution_id=request.metadata.get("evaluation_execution_id"),
    )
    if not any(
        item.get("speaker") == "caller" and item.get("text") == initial_utterance
        for item in transcript
    ):
        transcript.insert(0, {"speaker": "caller", "text": initial_utterance})
    close_task = asyncio.ensure_future(close_future)
    finished_task = asyncio.create_task(finished.wait())
    turn_limit_task = asyncio.create_task(turn_limit_reached.wait())
    _done, pending = await asyncio.wait(
        [close_task, finished_task, turn_limit_task],
        timeout=CALLER_CASE_TIMEOUT_SECONDS,
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
    if finished.is_set():
        outcome = "completed"
        guardrails = []
    elif turn_limit_reached.is_set():
        outcome = "turn_limit_reached"
        guardrails = ["caller_turn_limit"]
    else:
        outcome = "session_closed" if close_task in _done else "evaluation_timeout"
        guardrails = ["caller_timeout"] if outcome == "evaluation_timeout" else []
    evidence = {
        "transcript": transcript,
        "assistant_text": " ".join(
            str(item["text"]) for item in transcript if item["speaker"] == "agent"
        ),
        "transitions": transitions,
        "tool_calls": [],
        "variables": {},
        "guardrails": guardrails,
        "outcome": outcome,
        "metrics": {
            "turn_count": len(transcript),
            "agent_turn_count": agent_turn_count,
            "runtime": "livekit",
        },
    }
    if recording_path and recording_task is not None:
        recording_task.cancel()
        await asyncio.gather(recording_task, return_exceptions=True)
        recording_file = Path(recording_path)
        if recording_file.is_file() and recording_file.stat().st_size > 44:
            evidence["recording"] = {
                "filename": recording_file.name,
                "mime_type": "audio/wav",
            }
    await _post_evidence(request, evidence, settings)
    await _maybe_await(session.shutdown(drain=False))


async def caller_entrypoint(ctx: object) -> None:
    logger = get_logger(__name__)
    try:
        await _run_caller(ctx, get_settings())
    except Exception as exc:
        logger.error(
            "pipeline.eval_caller.entrypoint.failed",
            error=str(exc),
            room=getattr(getattr(ctx, "room", None), "name", None),
        )
        try:
            request = _resolve_request(ctx)
            await _post_evidence(
                request,
                {
                    "transcript": [],
                    "assistant_text": "",
                    "transitions": [],
                    "tool_calls": [],
                    "variables": {},
                    "guardrails": ["caller_runtime_error"],
                    "outcome": "evaluation_error",
                    "metrics": {"runtime": "livekit"},
                    "error": str(exc),
                },
                get_settings(),
            )
        except Exception as callback_exc:
            logger.error(
                "pipeline.eval_caller.failure_report.failed",
                error=str(callback_exc),
                room=getattr(getattr(ctx, "room", None), "name", None),
            )
        raise


def main() -> None:
    settings = get_settings()
    configure_logging("voice-pipeline-eval-caller", settings.log_level)
    sdk = load_livekit_sdk()
    sdk["cli"].run_app(
        sdk["WorkerOptions"](
            entrypoint_fnc=caller_entrypoint,
            agent_name="voice-eval-caller",
            ws_url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
            log_level=settings.log_level,
            load_threshold=float("inf") if settings.environment != "prod" else 0.7,
        )
    )
