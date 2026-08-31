from __future__ import annotations

import asyncio
import json
import re
import sys
import time
import wave
from array import array
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from livekit import rtc
from livekit.agents import Agent, AgentSession, StopResponse, function_tool

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
    _drain_runtime_event_tasks,
    _merge_turn_handling,
    _register_turn_event_logging,
    _session_close_future,
    _shutdown_session_safely,
    _speak,
    load_livekit_sdk,
)
from voice_pipeline.logging import configure_logging, get_logger

MAX_AGENT_TURNS = 20
CALLER_CASE_TIMEOUT_SECONDS = 120
REMOTE_GREETING_TIMEOUT_SECONDS = 12
REMOTE_TURN_FINAL_GRACE_SECONDS = 1.2
RECORDING_SAMPLE_RATE = 48000
RECORDING_BLOCK_FRAMES = RECORDING_SAMPLE_RATE
MIN_AUDIBLE_SAMPLE_AMPLITUDE = 8


def _recording_filename(execution_id: str) -> str:
    safe_execution_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", execution_id).strip("-")
    return f"eval-{safe_execution_id}.wav"


def _track_recording_filename(execution_id: str, speaker: str) -> str:
    safe_execution_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", execution_id).strip("-")
    return f"eval-{safe_execution_id}-{speaker}.wav"


def _mix_wav_files(
    source_paths: list[str],
    output_path: str,
    *,
    offsets: dict[str, float] | None = None,
) -> list[str]:
    sources: list[dict[str, object]] = []
    for source_path in source_paths:
        path = Path(source_path)
        if not path.is_file():
            continue
        source: wave.Wave_read | None = None
        try:
            source = wave.open(str(path), "rb")
            if (
                source.getnchannels() != 1
                or source.getsampwidth() != 2
                or source.getframerate() != RECORDING_SAMPLE_RATE
            ):
                continue
            frame_count = source.getnframes()
            if frame_count <= 0:
                continue
            sources.append(
                {
                    "path": source_path,
                    "source": source,
                    "offset_frames": round(
                        max(0.0, (offsets or {}).get(source_path, 0.0))
                        * RECORDING_SAMPLE_RATE
                    ),
                    "frame_count": frame_count,
                    "audible": False,
                }
            )
            source = None
        except (EOFError, OSError, wave.Error):
            continue
        finally:
            if source is not None:
                source.close()
    if not sources:
        for source_path in source_paths:
            Path(source_path).unlink(missing_ok=True)
        return []

    sample_count = max(
        int(source["offset_frames"]) + int(source["frame_count"])
        for source in sources
    )
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    try:
        with wave.open(output_path, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RECORDING_SAMPLE_RATE)
            for block_start in range(0, sample_count, RECORDING_BLOCK_FRAMES):
                block_size = min(RECORDING_BLOCK_FRAMES, sample_count - block_start)
                sample_sums = [0] * block_size
                sample_counts = [0] * block_size
                for source in sources:
                    offset_frames = int(source["offset_frames"])
                    frame_count = int(source["frame_count"])
                    source_start = max(0, block_start - offset_frames)
                    source_end = min(
                        frame_count,
                        block_start + block_size - offset_frames,
                    )
                    if source_end <= source_start:
                        continue
                    source_reader = source["source"]
                    assert isinstance(source_reader, wave.Wave_read)
                    source_reader.setpos(source_start)
                    audio = source_reader.readframes(source_end - source_start)
                    samples = array("h")
                    samples.frombytes(audio)
                    if sys.byteorder != "little":
                        samples.byteswap()
                    if any(
                        abs(sample) >= MIN_AUDIBLE_SAMPLE_AMPLITUDE for sample in samples
                    ):
                        source["audible"] = True
                    destination_start = max(0, offset_frames - block_start)
                    for index, sample in enumerate(samples):
                        target_index = destination_start + index
                        if target_index >= block_size:
                            break
                        sample_sums[target_index] += sample
                        sample_counts[target_index] += 1
                mixed = array(
                    "h",
                    [
                        max(
                            -32768,
                            min(
                                32767,
                                int(sample_sums[index] / sample_counts[index]),
                            ),
                        )
                        if sample_counts[index]
                        else 0
                        for index in range(block_size)
                    ],
                )
                if sys.byteorder != "little":
                    mixed.byteswap()
                output.writeframes(mixed.tobytes())
    finally:
        for source in sources:
            source_reader = source["source"]
            assert isinstance(source_reader, wave.Wave_read)
            source_reader.close()
        for source_path in source_paths:
            Path(source_path).unlink(missing_ok=True)
    return [str(source["path"]) for source in sources if source["audible"]]


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


@dataclass(slots=True)
class RemoteTurnAccumulator:
    active: bool = False
    _fragments: list[str] = field(default_factory=list)
    clock: Callable[[], float] = time.monotonic
    late_final_grace_seconds: float = REMOTE_TURN_FINAL_GRACE_SECONDS
    _last_flush_at: float | None = None
    _last_flush_event_at: float | None = None
    _last_event_at: float | None = None
    _seen_item_ids: set[str] = field(default_factory=set)

    def start(self) -> None:
        if not self.active:
            self._fragments.clear()
        self.active = True

    def add_final(
        self,
        text: str,
        *,
        item_id: str | None = None,
        created_at: float | None = None,
    ) -> bool:
        normalized = text.strip()
        if not normalized:
            return False
        now = self.clock()
        event_time = created_at if created_at is not None else now
        if item_id and not self.active and item_id in self._seen_item_ids:
            return False
        if (
            not self.active
            and self._last_flush_at is not None
            and self._last_flush_event_at is not None
            and created_at is not None
            and event_time <= self._last_flush_event_at
        ):
            return False
        if (
            not self.active
            and self._last_flush_at is not None
            and created_at is None
            and now - self._last_flush_at > self.late_final_grace_seconds
        ):
            return False
        if (
            self.active
            and created_at is not None
            and self._last_flush_event_at is not None
            and event_time <= self._last_flush_event_at
        ):
            return False
        if not self.active:
            self.start()
        if not self._fragments or normalized != self._fragments[-1]:
            combined = " ".join(self._fragments)
            if combined and normalized.startswith(combined):
                self._fragments[:] = [normalized]
            elif not combined or normalized not in combined:
                self._fragments.append(normalized)
        if item_id:
            self._seen_item_ids.add(item_id)
        self._last_event_at = event_time
        return True

    def flush(self) -> str:
        text = " ".join(self._fragments).strip()
        self._fragments.clear()
        self.active = False
        self._last_flush_at = self.clock()
        self._last_flush_event_at = self._last_event_at
        return text


def _resolve_request(ctx: object) -> ClientSessionRequest:
    metadata = getattr(getattr(ctx, "job", None), "metadata", "")
    if not isinstance(metadata, str) or not metadata.strip():
        raise ValueError("evaluation caller metadata is required")
    return parse_session_request_metadata(metadata)


def _caller_agent_instructions(request: ClientSessionRequest, initial_utterance: str) -> str:
    if not initial_utterance:
        return request.prompt.system_prompt
    return "\n".join(
        [
            request.prompt.system_prompt,
            "After hearing the production agent's greeting, make the first caller response.",
            f"Use exactly this first response and do not add another greeting: {json.dumps(initial_utterance)}",
        ]
    )


def _build_caller_agent(
    request: ClientSessionRequest,
    finished: asyncio.Event,
    initial_utterance: str,
    caller_state: dict[str, bool],
    speak_initial_response: Callable[[], Awaitable[None]],
):
    @function_tool(
        name="finish_eval_case",
        description="Mark the evaluation case complete after the production agent has finished the call.",
    )
    async def finish_eval_case(outcome: str = "", notes: str = "") -> str:
        if not finished.is_set():
            finished.set()
        return "The evaluation case was recorded. Do not speak again."

    class EvaluationCallerAgent(Agent):
        async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
            if new_message is not None and turn_ctx.get_by_id(new_message.id) is None:
                turn_ctx.insert(new_message)
                await self.update_chat_ctx(turn_ctx)
            if caller_state["initial_response_sent"]:
                return
            if caller_state["initial_response_started"]:
                raise StopResponse()
            await speak_initial_response()
            raise StopResponse()

    return EvaluationCallerAgent(
        instructions=_caller_agent_instructions(request, initial_utterance),
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
    caller_failed = asyncio.Event()
    turn_limit_reached = asyncio.Event()
    remote_greeting_completed = asyncio.Event()
    remote_greeting_ready = asyncio.Event()
    caller_state = {
        "initial_response_sent": False,
        "initial_response_started": False,
    }
    agent_turn_count = 0
    caller_failure: str | None = None
    remote_turn = RemoteTurnAccumulator()
    remote_flush_task: asyncio.Task[None] | None = None
    remote_flush_tasks: set[asyncio.Task[None]] = set()
    cleanup_started = False
    initial_response_task: asyncio.Task[None] | None = None
    evaluator_interruption_events: list[dict[str, object]] = []
    interruption_events: list[dict[str, object]] = []
    execution_id = str(request.metadata.get("evaluation_execution_id", "evaluation"))
    recording_path = str(Path(settings.recordings_dir) / _recording_filename(execution_id))
    recording_epoch = time.monotonic()
    recording_paths: list[str] = []
    recording_offsets: dict[str, float] = {}
    recording_speakers: dict[str, str] = {}
    recording_tasks: set[asyncio.Task[None]] = set()
    recording_track_ids: set[str] = set()
    recording_task_speakers: dict[asyncio.Task[None], str] = {}
    recording_failures: list[dict[str, str]] = []
    recording_failed = False
    recording_mixed_speakers: set[str] = set()
    recording_mixed = False

    def start_track_recording(track: object, speaker: str, participant: object) -> None:
        nonlocal recording_path
        track_kind = getattr(track, "kind", "")
        track_kind_name = str(track_kind).lower()
        if isinstance(track_kind, int):
            try:
                track_kind_name = rtc.TrackKind.Name(track_kind).lower()
            except ValueError:
                pass
        if "audio" not in track_kind_name:
            return
        track_id = str(getattr(track, "sid", "") or id(track))
        track_key = f"{speaker}:{track_id}"
        if track_key in recording_track_ids:
            return
        recording_track_ids.add(track_key)
        segment_number = sum(1 for value in recording_speakers.values() if value == speaker)
        source_path = str(
            Path(settings.recordings_dir)
            / _track_recording_filename(execution_id, f"{speaker}-{segment_number}")
        )
        recording_path = str(Path(settings.recordings_dir) / _recording_filename(execution_id))
        recording_paths.append(source_path)
        recording_offsets[source_path] = max(0.0, time.monotonic() - recording_epoch)
        recording_speakers[source_path] = speaker
        Path(source_path).parent.mkdir(parents=True, exist_ok=True)
        logger.info(
            "pipeline.eval_caller.recording.started",
            speaker=speaker,
            participant=getattr(participant, "identity", "local"),
            path=source_path,
        )

        async def record_track() -> None:
            stream = rtc.AudioStream.from_track(
                track=track,
                sample_rate=RECORDING_SAMPLE_RATE,
                num_channels=1,
                frame_size_ms=20,
            )
            try:
                with wave.open(source_path, "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(RECORDING_SAMPLE_RATE)
                    async for frame_event in stream:
                        output.writeframes(bytes(frame_event.frame.data))
            finally:
                await stream.aclose()

        task = asyncio.create_task(record_track())
        recording_tasks.add(task)
        recording_task_speakers[task] = speaker

        def on_recording_done(done: asyncio.Task[None]) -> None:
            nonlocal recording_failed
            recording_tasks.discard(done)
            speaker_name = recording_task_speakers.pop(done, speaker)
            if done.cancelled():
                return
            error = done.exception()
            if error is not None:
                recording_failed = True
                failure = {"speaker": speaker_name, "error": repr(error)}
                recording_failures.append(failure)
                logger.error("pipeline.eval_caller.recording.failed", **failure)

        task.add_done_callback(on_recording_done)

    def on_local_track_published(publication: object, track: object) -> None:
        logger.info(
            "pipeline.eval_caller.local_track.published",
            source=getattr(publication, "source", None),
        )
        start_track_recording(track, "caller", ctx.room.local_participant)

    def on_remote_track_subscribed(
        track: object, publication: object, participant: object
    ) -> None:
        logger.info(
            "pipeline.eval_caller.track.subscribed",
            participant=getattr(participant, "identity", None),
            source=getattr(publication, "source", None),
            track_kind=getattr(track, "kind", None),
        )
        start_track_recording(track, "agent", participant)

    def flush_remote_turn(flush_task: asyncio.Task[None] | None = None) -> None:
        nonlocal agent_turn_count, remote_flush_task
        if flush_task is None or remote_flush_task is flush_task:
            remote_flush_task = None
        text = remote_turn.flush()
        if not text:
            return
        transcript.append({"speaker": "agent", "text": text})
        agent_turn_count += 1
        logger.info(
            "pipeline.eval_caller.remote_turn.completed",
            transcript=text,
            turn_number=agent_turn_count,
        )
        if agent_turn_count >= MAX_AGENT_TURNS:
            logger.warning(
                "pipeline.eval_caller.turn_limit_reached",
                max_agent_turns=MAX_AGENT_TURNS,
            )
            turn_limit_reached.set()

    def schedule_remote_flush() -> None:
        nonlocal remote_flush_task, initial_response_task
        if remote_flush_task is not None:
            remote_flush_task.cancel()

        async def flush_after_transcription_grace() -> None:
            nonlocal initial_response_task
            try:
                await asyncio.sleep(REMOTE_TURN_FINAL_GRACE_SECONDS)
                flush_remote_turn(asyncio.current_task())
                if remote_greeting_completed.is_set():
                    remote_greeting_ready.set()
                    if initial_response_task is None and not caller_state["initial_response_sent"]:
                        initial_response_task = asyncio.create_task(speak_initial_response())
            except asyncio.CancelledError:
                return

        remote_flush_task = asyncio.create_task(flush_after_transcription_grace())
        remote_flush_tasks.add(remote_flush_task)
        remote_flush_task.add_done_callback(remote_flush_tasks.discard)

    def on_agent_transcript(event: object) -> None:
        if cleanup_started:
            return
        text = str(getattr(event, "transcript", "") or "").strip()
        if text and bool(getattr(event, "is_final", False)):
            if not remote_turn.add_final(
                text,
                item_id=getattr(event, "item_id", None),
                created_at=getattr(event, "created_at", None),
            ):
                logger.debug(
                    "pipeline.eval_caller.stt.final_ignored_after_turn",
                    transcript=text,
                )
                return
            logger.info("pipeline.eval_caller.stt.final", transcript=text)
            remote_greeting_completed.set()
            schedule_remote_flush()

    def on_remote_user_state_changed(event: object) -> None:
        nonlocal remote_flush_task
        if cleanup_started:
            return
        old_state = str(getattr(event, "old_state", "") or "")
        new_state = str(getattr(event, "new_state", "") or "")
        if new_state == "speaking":
            if remote_flush_task is not None:
                remote_flush_task.cancel()
                remote_flush_task = None
            remote_turn.start()
        elif remote_turn.active and old_state == "speaking" and new_state in {
            "listening",
            "away",
        }:
            schedule_remote_flush()

    def on_caller_speech(event: object) -> None:
        role = _item_role(event)
        if role not in {"assistant", "agent"}:
            return
        text = _text_from_item(event)
        if text and (
            not transcript
            or transcript[-1].get("speaker") != "caller"
            or transcript[-1].get("text") != text
        ):
            transcript.append({"speaker": "caller", "text": text})

    async def speak_initial_response() -> None:
        nonlocal caller_failure
        if caller_state["initial_response_sent"]:
            return
        if caller_state["initial_response_started"]:
            return
        caller_state["initial_response_started"] = True
        try:
            await asyncio.wait_for(
                remote_greeting_ready.wait(),
                timeout=REMOTE_GREETING_TIMEOUT_SECONDS,
            )
            await _speak(session, initial_utterance, allow_interruptions=True)
            caller_state["initial_response_sent"] = True
        except TimeoutError:
            caller_state["initial_response_started"] = False
            logger.warning(
                "pipeline.eval_caller.initial_response_timeout",
                timeout_seconds=REMOTE_GREETING_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            caller_state["initial_response_started"] = False
            caller_failure = str(exc)
            caller_failed.set()
            logger.error(
                "pipeline.eval_caller.initial_response_failed",
                error=repr(exc),
            )

    async def cleanup_session() -> None:
        nonlocal cleanup_started, initial_response_task
        nonlocal recording_failed, recording_mixed, remote_flush_task
        cleanup_started = True
        while remote_flush_tasks:
            tasks = tuple(remote_flush_tasks)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        remote_flush_task = None
        if initial_response_task is not None:
            initial_response_task.cancel()
            await asyncio.gather(initial_response_task, return_exceptions=True)
            initial_response_task = None
        flush_remote_turn()
        if recording_tasks:
            tasks = tuple(recording_tasks)
            for task in tasks:
                task.cancel()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            if any(isinstance(result, Exception) for result in results):
                recording_failed = True
        if not recording_mixed and recording_path:
            participants = set(recording_speakers.values())
            if participants == {"caller", "agent"}:
                mixed_sources = await asyncio.to_thread(
                    _mix_wav_files,
                    recording_paths,
                    recording_path,
                    offsets=recording_offsets,
                )
                recording_mixed_speakers.update(
                    recording_speakers[source_path]
                    for source_path in mixed_sources
                    if source_path in recording_speakers
                )
                recording_mixed = (
                    not recording_failed
                    and recording_mixed_speakers == {"caller", "agent"}
                )
                if not recording_mixed:
                    Path(recording_path).unlink(missing_ok=True)
                    logger.warning(
                        "pipeline.eval_caller.recording.incomplete",
                        participants=sorted(recording_mixed_speakers),
                    )
            else:
                recording_mixed_speakers.update(participants)
                logger.warning(
                    "pipeline.eval_caller.recording.incomplete",
                    participants=sorted(participants),
                )

    def on_room_data(packet: object) -> None:
        event = _runtime_event(packet)
        if event and event.get("event_type") == "turn.overlapping_speech":
            interruption_events.append(
                {
                    "type": "overlapping_speech",
                    "source": "production_agent",
                    "is_interruption": bool(event.get("is_interruption", False)),
                    "agent_ended": bool(event.get("agent_ended", False)),
                    "total_duration": event.get("total_duration"),
                }
            )
        if event and event.get("event_type") == "turn.false_interruption":
            interruption_events.append(
                {
                    "type": "false_interruption",
                    "source": "production_agent",
                    "resumed": bool(event.get("resumed", False)),
                }
            )
        if event and event.get("event_type") == "workflow.transitioned":
            transitions.append(event)
        if event and event.get("event_type") == "workflow.ended":
            finished.set()

    def on_overlap(event: object) -> None:
        evaluator_interruption_events.append(
            {
                "type": "overlapping_speech",
                "is_interruption": bool(getattr(event, "is_interruption", False)),
                "speech_duration": getattr(event, "speech_duration", None),
            }
        )

    def on_false_interruption(event: object) -> None:
        evaluator_interruption_events.append(
            {
                "type": "false_interruption",
                "resumed": bool(getattr(event, "resumed", False)),
            }
        )

    def on_track_subscription_failed(participant: object, track_sid: str, error: str) -> None:
        nonlocal recording_failed
        recording_failed = True
        failure = {
            "speaker": "agent",
            "error": f"track {track_sid} for {getattr(participant, 'identity', 'unknown')}: {error}",
        }
        recording_failures.append(failure)
        logger.error("pipeline.eval_caller.recording.subscription_failed", **failure)

    try:
        session.on("user_input_transcribed", on_agent_transcript)
        session.on("user_state_changed", on_remote_user_state_changed)
        session.on("conversation_item_added", on_caller_speech)
        _register_turn_event_logging(session, logger, "pipeline.eval_caller.turn")
        session.on("overlapping_speech", on_overlap)
        session.on("agent_false_interruption", on_false_interruption)
        ctx.room.on("local_track_published", on_local_track_published)
        ctx.room.on("track_subscribed", on_remote_track_subscribed)
        ctx.room.on("track_subscription_failed", on_track_subscription_failed)
        ctx.room.on("data_received", on_room_data)
        await ctx.connect(
            auto_subscribe=sdk["AutoSubscribe"].SUBSCRIBE_ALL,
            single_peer_connection=True,
        )
        logger.info(
            "pipeline.eval_caller.connected",
            room=getattr(getattr(ctx, "room", None), "name", None),
        )
        for participant in getattr(ctx.room, "remote_participants", {}).values():
            for publication in getattr(participant, "track_publications", {}).values():
                track = getattr(publication, "track", None)
                if track is not None:
                    on_remote_track_subscribed(track, publication, participant)
        local_participant = getattr(ctx.room, "local_participant", None)
        for publication in getattr(local_participant, "track_publications", {}).values():
            track = getattr(publication, "track", None)
            if track is not None:
                on_local_track_published(publication, track)
        close_future = _session_close_future(session, ctx.room)
        initial_utterance = request.prompt.opening_message or "Hello, I am calling about the service."
        agent = _build_caller_agent(
            request,
            finished,
            initial_utterance,
            caller_state,
            speak_initial_response,
        )
    except Exception:
        await _shutdown_session_safely(session)
        raise
    try:
        logger.info("pipeline.eval_caller.session.starting")
        await asyncio.wait_for(
            session.start(agent=agent, room=ctx.room, room_options=bundle.room_options),
            timeout=SESSION_START_TIMEOUT_SECONDS,
        )
        logger.info("pipeline.eval_caller.session.ready")
        remote_greeting_received = remote_greeting_completed.is_set()
        if not remote_greeting_completed.is_set():
            logger.info("pipeline.eval_caller.waiting_for_remote_greeting")
            try:
                await asyncio.wait_for(
                    remote_greeting_completed.wait(),
                    timeout=REMOTE_GREETING_TIMEOUT_SECONDS,
                )
                remote_greeting_received = True
            except TimeoutError:
                logger.warning(
                    "pipeline.eval_caller.remote_greeting_timeout",
                    timeout_seconds=REMOTE_GREETING_TIMEOUT_SECONDS,
                )
        if not remote_greeting_received:
            logger.info("pipeline.eval_caller.sending_initial_utterance_fallback")
            remote_greeting_ready.set()
            caller_state["initial_response_sent"] = True
            try:
                await _speak(session, initial_utterance, allow_interruptions=False)
            except Exception as exc:
                caller_state["initial_response_sent"] = False
                caller_failure = str(exc)
                caller_failed.set()
                logger.error(
                    "pipeline.eval_caller.initial_response_fallback_failed",
                    error=repr(exc),
                )
        logger.info(
            "pipeline.eval_caller.session.started",
            room=getattr(ctx.room, "name", None),
            execution_id=request.metadata.get("evaluation_execution_id"),
        )
        if not remote_greeting_received and not any(
            item.get("speaker") == "caller" and item.get("text") == initial_utterance
            for item in transcript
        ):
            transcript.insert(0, {"speaker": "caller", "text": initial_utterance})
        close_task = asyncio.ensure_future(close_future)
        finished_task = asyncio.create_task(finished.wait())
        caller_failed_task = asyncio.create_task(caller_failed.wait())
        turn_limit_task = asyncio.create_task(turn_limit_reached.wait())
        _done, pending = await asyncio.wait(
            [close_task, finished_task, caller_failed_task, turn_limit_task],
            timeout=CALLER_CASE_TIMEOUT_SECONDS,
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        if finished.is_set():
            outcome = "completed"
            guardrails = []
        elif caller_failed.is_set():
            outcome = "caller_runtime_error"
            guardrails = ["caller_runtime_error"]
        elif turn_limit_reached.is_set():
            outcome = "turn_limit_reached"
            guardrails = ["caller_turn_limit"]
        else:
            outcome = "session_closed" if close_task in _done else "evaluation_timeout"
            guardrails = ["caller_timeout"] if outcome == "evaluation_timeout" else []
        await cleanup_session()
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
                "interruption_events": interruption_events,
                "evaluator_interruption_events": evaluator_interruption_events,
                "interruption_count": sum(
                    1
                    for event in interruption_events
                    if event["type"] == "overlapping_speech" and event["is_interruption"]
                ),
                "false_interruption_count": sum(
                    1 for event in interruption_events if event["type"] == "false_interruption"
                ),
                "runtime": "livekit",
            },
        }
        if recording_mixed and recording_path:
            recording_file = Path(recording_path)
            if recording_file.is_file() and recording_file.stat().st_size > 44:
                evidence["recording"] = {
                    "filename": recording_file.name,
                    "mime_type": "audio/wav",
                    "participants": sorted(recording_mixed_speakers),
                }
        else:
            if "recording_incomplete" not in guardrails:
                guardrails.append("recording_incomplete")
            evidence["recording"] = {
                "status": "incomplete",
                "participants": sorted(recording_mixed_speakers),
                "failures": recording_failures,
            }
        if caller_failure:
            evidence["error"] = caller_failure
        await _post_evidence(request, evidence, settings)
    finally:
        try:
            await cleanup_session()
            await _drain_runtime_event_tasks(session)
        finally:
            await _shutdown_session_safely(session)


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
