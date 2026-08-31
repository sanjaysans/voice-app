import asyncio
import json
import struct
import wave
from types import SimpleNamespace

import pytest
from livekit.agents import ChatContext, ChatMessage, StopResponse

from voice_pipeline.config import Settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.domain.workflow import WorkflowGraph
from voice_pipeline.interfaces.livekit.eval_caller import (
    MAX_AGENT_TURNS,
    RemoteTurnAccumulator,
    _build_caller_agent,
    _item_role,
    _mix_wav_files,
)
from voice_pipeline.interfaces.livekit.worker import (
    _build_transition_tool,
    _drain_runtime_event_tasks,
    _merge_turn_handling,
    _prewarm_streaming_providers,
    _register_turn_event_logging,
    _run_worker_entrypoint,
    _shutdown_session,
    _speak,
    _streaming_runtime_payload,
    build_worker_bootstrap,
    build_worker_options_kwargs,
)


@pytest.mark.asyncio
async def test_speak_supports_livekit_sync_speech_handle() -> None:
    class StubSession:
        def say(self, message: str, **kwargs):
            return {"message": message, "kwargs": kwargs}

    speech = await _speak(StubSession(), "Hello", allow_interruptions=False)

    assert speech == {"message": "Hello", "kwargs": {"allow_interruptions": False}}


@pytest.mark.asyncio
async def test_shutdown_session_awaits_async_livekit_close() -> None:
    class StubSession:
        closed = False

        async def aclose(self) -> None:
            await asyncio.sleep(0)
            self.closed = True

    session = StubSession()

    await _shutdown_session(session)

    assert session.closed is True


@pytest.mark.asyncio
async def test_shutdown_session_falls_back_when_async_close_fails() -> None:
    class StubSession:
        def __init__(self) -> None:
            self.shutdown_called = False

        async def aclose(self) -> None:
            raise RuntimeError("close failed")

        def shutdown(self, **kwargs) -> None:
            self.shutdown_called = True

    session = StubSession()

    await _shutdown_session(session)

    assert session.shutdown_called is True


@pytest.mark.asyncio
async def test_terminal_transition_generates_closing_response_and_shuts_down() -> None:
    shutdown_event = asyncio.Event()

    class StubSession:
        def __init__(self) -> None:
            self.shutdown_called = False

        def generate_reply(self, **kwargs):
            return None

        def shutdown(self, **kwargs):
            self.shutdown_called = True
            shutdown_event.set()

        async def update_agent(self, _agent) -> None:
            return None

    class StubAgent:
        async def update_instructions(self, _instructions: str) -> None:
            return None

    session = StubSession()
    workflow = WorkflowGraph(
        {
            "nodes": [
                {"id": "entry", "label": "Entry"},
                {"id": "end_call", "label": "End call", "node_type": "end_call"},
            ],
            "edges": [{"source_id": "entry", "target_id": "end_call", "condition": "Complete"}],
        }
    )
    transition = _build_transition_tool(
        session,
        workflow,
        {"agent": StubAgent()},
        "base",
        SimpleNamespace(info=lambda *args, **kwargs: None, warning=lambda *args, **kwargs: None),
    )

    result = await transition(next_state_id="end_call", reason="The caller confirmed completion")
    await asyncio.wait_for(shutdown_event.wait(), timeout=1)

    assert "call is ending" in result
    assert workflow.ended is True
    assert session.shutdown_called is True


def test_worker_bootstrap_surfaces_default_browser_providers() -> None:
    bootstrap = build_worker_bootstrap(Settings())

    assert bootstrap["bootstrap"]["providers"]["stt"] == "deepgram-stt"
    assert bootstrap["bootstrap"]["providers"]["llm"] == "openai-responses-llm"
    assert bootstrap["bootstrap"]["providers"]["tts"] == "cartesia-tts"
    assert bootstrap["bootstrap"]["providers"]["vad"] == "silero-vad"


def test_pipeline_settings_use_latency_safe_turn_defaults() -> None:
    settings = Settings()

    assert settings.endpointing_mode == "fixed"
    assert settings.endpointing_ms == 600
    assert settings.min_endpointing_ms == 600
    assert settings.max_endpointing_ms == 600
    assert settings.interruption_mode == "vad"
    assert settings.preemptive_generation is False
    assert settings.preemptive_max_retries == 1


def test_streaming_runtime_payload_reports_all_provider_layers() -> None:
    bundle = SimpleNamespace(
        stt=SimpleNamespace(
            model="flux-general-en",
            capabilities=SimpleNamespace(streaming=True),
        ),
        llm=SimpleNamespace(
            model="gpt-4.1-mini",
            _opts=SimpleNamespace(use_websocket=True),
        ),
        tts=SimpleNamespace(
            model="sonic-3",
            capabilities=SimpleNamespace(streaming=True),
        ),
    )

    payload = _streaming_runtime_payload(bundle)

    assert payload["stt"]["streaming"] is True
    assert payload["llm"]["transport"] == "websocket"
    assert payload["tts"]["streaming"] is True


def test_prewarm_streaming_providers_is_non_blocking_and_sdk_safe() -> None:
    class StubTts:
        def __init__(self) -> None:
            self.prewarmed = False

        def prewarm(self) -> None:
            self.prewarmed = True

    class StubPool:
        def __init__(self) -> None:
            self.prewarmed = False

        def prewarm(self) -> None:
            self.prewarmed = True

    tts = StubTts()
    pool = StubPool()
    bundle = SimpleNamespace(
        tts=tts,
        llm=SimpleNamespace(_ws=SimpleNamespace(_pool=pool)),
    )

    _prewarm_streaming_providers(bundle)

    assert tts.prewarmed is True
    assert pool.prewarmed is True


def test_worker_options_include_livekit_connection_settings() -> None:
    options = build_worker_options_kwargs(
        Settings(
            livekit_startup_mode="dispatch",
            livekit_url="wss://voice.example.livekit.cloud",
            livekit_api_key="lk-key",
            livekit_api_secret="lk-secret",
            livekit_agent_name="voice-test-agent",
            log_level="DEBUG",
        )
    )

    assert options == {
        "agent_name": "voice-test-agent",
        "ws_url": "wss://voice.example.livekit.cloud",
        "api_key": "lk-key",
        "api_secret": "lk-secret",
        "log_level": "DEBUG",
        "load_threshold": float("inf"),
    }


def test_merge_turn_handling_enables_layered_turn_taking_defaults() -> None:
    policy = SimpleNamespace(
        allow_interruptions=True,
        endpointing_mode="dynamic",
        endpointing_alpha=0.8,
        min_endpointing_ms=500,
        max_endpointing_ms=2200,
        interruption_mode="adaptive",
        discard_audio_if_uninterruptible=True,
        min_interruption_duration_ms=350,
        min_interruption_words=1,
        false_interruption_recovery=True,
        false_interruption_timeout_ms=1800,
        backchannel_boundary_ms=1000,
        preemptive_generation=True,
        preemptive_tts=False,
        preemptive_max_speech_duration_ms=10000,
        preemptive_max_retries=3,
    )
    plan = SimpleNamespace(blueprint=SimpleNamespace(turn_policy=policy))

    turn_handling = _merge_turn_handling({}, plan)

    assert turn_handling == {
        "turn_detection": "stt",
        "endpointing": {"mode": "dynamic", "min_delay": 0.5, "max_delay": 2.2, "alpha": 0.8},
        "interruption": {
            "enabled": True,
            "mode": "adaptive",
            "discard_audio_if_uninterruptible": True,
            "min_duration": 0.35,
            "min_words": 1,
            "resume_false_interruption": True,
            "false_interruption_timeout": 1.8,
            "backchannel_boundary": 1.0,
        },
        "preemptive_generation": {
            "enabled": True,
            "preemptive_tts": False,
            "max_speech_duration": 10.0,
            "max_retries": 3,
        },
    }


def test_merge_turn_handling_applies_fixed_endpointing_delay() -> None:
    policy = SimpleNamespace(
        allow_interruptions=True,
        endpointing_mode="fixed",
        endpointing_ms=700,
        min_endpointing_ms=500,
        max_endpointing_ms=2200,
        endpointing_alpha=0.8,
        interruption_mode="adaptive",
        discard_audio_if_uninterruptible=True,
        min_interruption_duration_ms=350,
        min_interruption_words=1,
        false_interruption_recovery=True,
        false_interruption_timeout_ms=1800,
        backchannel_boundary_ms=1000,
        preemptive_generation=True,
        preemptive_tts=False,
        preemptive_max_speech_duration_ms=10000,
        preemptive_max_retries=3,
    )

    turn_handling = _merge_turn_handling(
        {}, SimpleNamespace(blueprint=SimpleNamespace(turn_policy=policy))
    )

    assert turn_handling["endpointing"] == {
        "mode": "fixed",
        "min_delay": 0.7,
        "max_delay": 0.7,
        "alpha": 0.8,
    }


def test_eval_caller_uses_conversation_item_role_for_local_speech() -> None:
    event = SimpleNamespace(item=SimpleNamespace(role="assistant"))

    assert _item_role(event) == "assistant"
    assert MAX_AGENT_TURNS == 20


@pytest.mark.asyncio
async def test_eval_caller_commits_user_turn_before_suppressing_first_reply() -> None:
    request = ClientSessionRequest(
        room={"room_name": "eval-room", "participant_identity": "caller"},
        prompt={"system_prompt": "Act as a test caller."},
        stt={"api_key": "dg-key", "model": "flux-general-en", "language": "en-US"},
        llm={"api_key": "oa-key", "model": "gpt-4.1-mini"},
        tts={"api_key": "ca-key", "voice": "cartesia-voice"},
    )
    caller_state = {"initial_response_sent": False, "initial_response_started": False}
    agent = _build_caller_agent(
        request,
        asyncio.Event(),
        "Hello from the caller.",
        caller_state,
        lambda: asyncio.sleep(0),
    )
    turn_ctx = ChatContext()
    message = ChatMessage(role="user", content=["Hello from the production agent."])

    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(turn_ctx, message)

    assert agent.chat_ctx.get_by_id(message.id) is not None


def test_remote_turn_accumulator_merges_cumulative_fragments_and_rejects_stale_finals() -> None:
    current_time = [0.0]
    accumulator = RemoteTurnAccumulator(clock=lambda: current_time[0])

    accumulator.start()
    assert accumulator.add_final("Hello there", item_id="turn-1", created_at=1.0) is True
    assert (
        accumulator.add_final(
            "Hello there, how are you?", item_id="turn-1-update", created_at=2.0
        )
        is True
    )
    assert accumulator.flush() == "Hello there, how are you?"
    current_time[0] = 0.5
    assert accumulator.add_final("late fragment", item_id="turn-1-late", created_at=3.0) is True
    assert accumulator.flush() == "late fragment"

    current_time[0] = 2.0
    assert accumulator.add_final("stale fragment", item_id="turn-1-stale", created_at=2.5) is False
    assert accumulator.flush() == ""
    current_time[0] = 5.0
    assert accumulator.add_final("Delayed new turn", item_id="turn-2", created_at=4.0) is True
    assert accumulator.flush() == "Delayed new turn"

    accumulator.start()
    assert accumulator.add_final("Next turn", item_id="turn-3", created_at=6.0) is True
    assert accumulator.flush() == "Next turn"


def test_mix_wav_files_includes_audio_from_both_call_participants(tmp_path) -> None:
    caller_path = tmp_path / "caller.wav"
    agent_path = tmp_path / "agent.wav"
    output_path = tmp_path / "mixed.wav"

    for path, samples in (
        (caller_path, (1000, 2000, 3000)),
        (agent_path, (3000, 4000)),
    ):
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(48000)
            output.writeframes(struct.pack(f"<{len(samples)}h", *samples))

    recorded = _mix_wav_files(
        [str(caller_path), str(agent_path)],
        str(output_path),
        offsets={str(agent_path): 1 / 48000},
    )

    assert recorded == [str(caller_path), str(agent_path)]
    assert caller_path.exists() is False
    assert agent_path.exists() is False
    with wave.open(str(output_path), "rb") as mixed:
        assert mixed.getnchannels() == 1
        assert mixed.getframerate() == 48000
        assert struct.unpack("<3h", mixed.readframes(3)) == (1000, 2500, 3500)


def test_mix_wav_files_does_not_count_silent_participant_audio(tmp_path) -> None:
    caller_path = tmp_path / "caller.wav"
    agent_path = tmp_path / "agent.wav"
    output_path = tmp_path / "mixed.wav"

    for path, samples in (
        (caller_path, (0, 0, 0)),
        (agent_path, (100, 200, 300)),
    ):
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(48000)
            output.writeframes(struct.pack(f"<{len(samples)}h", *samples))

    recorded = _mix_wav_files(
        [str(caller_path), str(agent_path)],
        str(output_path),
    )

    assert recorded == [str(agent_path)]
    assert caller_path.exists() is False
    assert agent_path.exists() is False


def test_merge_turn_handling_uses_low_sensitivity_preset() -> None:
    policy = SimpleNamespace(
        allow_interruptions=True,
        endpointing_mode="dynamic",
        endpointing_alpha=0.8,
        min_endpointing_ms=500,
        max_endpointing_ms=2200,
        interruption_mode="adaptive",
        interruption_sensitivity="low",
        discard_audio_if_uninterruptible=True,
        min_interruption_duration_ms=350,
        min_interruption_words=1,
        false_interruption_recovery=True,
        false_interruption_timeout_ms=1800,
        backchannel_boundary_ms=1000,
        preemptive_generation=True,
        preemptive_tts=False,
        preemptive_max_speech_duration_ms=10000,
        preemptive_max_retries=3,
    )

    turn_handling = _merge_turn_handling(
        {}, SimpleNamespace(blueprint=SimpleNamespace(turn_policy=policy))
    )

    assert turn_handling["interruption"]["min_duration"] == 0.5
    assert turn_handling["interruption"]["min_words"] == 2


@pytest.mark.asyncio
async def test_turn_event_logging_preserves_provider_interruption_classification() -> None:
    class StubSession:
        def __init__(self) -> None:
            self.handlers: dict[str, object] = {}

        def on(self, event: str, callback):
            self.handlers[event] = callback

    class StubParticipant:
        def __init__(self) -> None:
            self.published: list[dict[str, object]] = []

        async def publish_data(self, data: bytes, **_kwargs) -> None:
            self.published.append(json.loads(data.decode("utf-8")))

    class StubRoom:
        def __init__(self) -> None:
            self.local_participant = StubParticipant()

    class StubLogger:
        def __init__(self) -> None:
            self.events: list[tuple[str, dict[str, object]]] = []

        def info(self, event_name: str, **payload) -> None:
            self.events.append((event_name, payload))

    session = StubSession()
    room = StubRoom()
    logger = StubLogger()
    _register_turn_event_logging(session, logger, "test.turn", room)

    session.handlers["overlapping_speech"](
        SimpleNamespace(
            is_interruption=True,
            agent_ended=False,
            total_duration=0.8,
            prediction_duration=0.4,
            detection_delay=0.1,
        )
    )
    session.handlers["agent_false_interruption"](SimpleNamespace(resumed=True))
    session.handlers["metrics_collected"](
        SimpleNamespace(
            metrics=SimpleNamespace(
                type="tts_metrics",
                label="cartesia",
                ttfb=0.31,
                characters_count=22,
            )
        )
    )
    session.handlers["overlapping_speech"](
        SimpleNamespace(
            is_interruption=False,
            agent_ended=False,
            total_duration=0.2,
            prediction_duration=0.1,
            detection_delay=0.05,
        )
    )

    await _drain_runtime_event_tasks(session)

    events = room.local_participant.published
    assert [event["event_type"] for event in events] == [
        "turn.overlapping_speech",
        "turn.false_interruption",
        "turn.metrics",
        "turn.overlapping_speech",
    ]
    assert events[0]["is_interruption"] is True
    assert events[1]["resumed"] is True
    assert events[2]["metric_type"] == "tts_metrics"
    assert events[2]["ttfb"] == 0.31
    assert events[3]["is_interruption"] is False
    assert logger.events[0][0] == "test.turn.overlapping_speech"


def test_turn_event_logging_records_provider_timings_without_transcript_data() -> None:
    class StubSession:
        def __init__(self) -> None:
            self.handlers: dict[str, object] = {}

        def on(self, event: str, callback):
            self.handlers[event] = callback

    class StubLogger:
        def __init__(self) -> None:
            self.events: list[tuple[str, dict[str, object]]] = []

        def info(self, event_name: str, **payload) -> None:
            self.events.append((event_name, payload))

    logger = StubLogger()
    session = StubSession()
    _register_turn_event_logging(session, logger, "test.turn")

    session.handlers["metrics_collected"](
        SimpleNamespace(
            metrics=SimpleNamespace(
                type="llm_metrics",
                label="openai.responses",
                ttft=0.22,
                prompt_tokens=120,
                total_tokens=18,
            )
        )
    )

    event_name, payload = logger.events[-1]
    assert event_name == "test.turn.metrics"
    assert payload == {
        "metric_type": "llm_metrics",
        "label": "openai.responses",
        "ttft": 0.22,
        "prompt_tokens": 120,
        "total_tokens": 18,
    }
    assert "transcript" not in payload


@pytest.mark.asyncio
async def test_worker_entrypoint_waits_for_close_event(monkeypatch) -> None:
    class StubRoom:
        def __init__(self) -> None:
            self.name = "voice-room-local"
            self.handlers: dict[str, object] = {}

        def on(self, event: str, callback):
            self.handlers[event] = callback
            return callback

    class StubSession:
        last_instance = None

        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs
            self.handlers: dict[str, object] = {}
            self.say_messages: list[str] = []
            StubSession.last_instance = self

        def on(self, event: str, callback):
            self.handlers[event] = callback
            return callback

        async def start(self, **kwargs):
            self.start_kwargs = kwargs
            return None

        async def say(self, message: str):
            self.say_messages.append(message)
            return None

    class StubAgent:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

    class StubValidator:
        @staticmethod
        def to_bootstrap_metadata(plan, runtime):
            return {"providers": {"stt": "deepgram-stt", "llm": "openai-responses-llm"}}

        def __init__(self, _settings) -> None:
            pass

        def describe(self, _plan):
            return SimpleNamespace(
                configured=True,
                startup_mode="dispatch",
                model_dump=lambda mode="json": {"transport": "livekit"},
            )

    plan = SimpleNamespace(
        is_valid=True,
        errors=[],
        warnings=[],
        blueprint=SimpleNamespace(
            turn_policy=SimpleNamespace(
                allow_interruptions=True,
                min_endpointing_ms=300,
                max_endpointing_ms=1200,
                false_interruption_recovery=True,
            )
        ),
    )

    room = StubRoom()
    ctx = SimpleNamespace(
        room=room,
        worker_id="worker-1",
        job=SimpleNamespace(metadata=""),
        connect=lambda **kwargs: asyncio.sleep(0),
        log_context_fields=lambda: {},
    )
    request = ClientSessionRequest(
        room={"room_name": "voice-room-local", "participant_identity": "web-user-1"},
        prompt={"opening_message": "Hello from Voice."},
        stt={"api_key": "dg-key", "model": "flux-general-en", "language": "en-US"},
        llm={"api_key": "oa-key", "model": "gpt-4.1-mini"},
        tts={"api_key": "ca-key", "voice": "cartesia-voice"},
    )

    monkeypatch.setattr(
        "voice_pipeline.interfaces.livekit.worker.load_livekit_sdk",
        lambda: {"AutoSubscribe": SimpleNamespace(SUBSCRIBE_ALL="all")},
    )
    monkeypatch.setattr("voice_pipeline.interfaces.livekit.worker.AgentSession", StubSession)
    monkeypatch.setattr("voice_pipeline.interfaces.livekit.worker.Agent", StubAgent)
    monkeypatch.setattr(
        "voice_pipeline.interfaces.livekit.worker.build_runtime_plan_for_client_session",
        lambda settings, session_request: plan,
    )
    monkeypatch.setattr(
        "voice_pipeline.interfaces.livekit.worker.LiveKitRuntimeValidator",
        StubValidator,
    )
    monkeypatch.setattr(
        "voice_pipeline.interfaces.livekit.worker.build_provider_bundle",
        lambda session_request: SimpleNamespace(
            stt=object(),
            llm=object(),
            tts=object(),
            vad=object(),
            turn_handling={},
            room_options=SimpleNamespace(),
        ),
    )

    task = asyncio.create_task(
        _run_worker_entrypoint(ctx, settings=Settings(), session_request=request)
    )
    await asyncio.sleep(0.05)

    assert task.done() is False
    assert StubSession.last_instance is not None
    assert StubSession.last_instance.say_messages == ["Hello from Voice."]
    assert StubSession.last_instance.kwargs["turn_handling"] == {
        "turn_detection": "stt",
        "endpointing": {
            "mode": "dynamic",
            "min_delay": 0.3,
            "max_delay": 1.2,
            "alpha": 0.8,
        },
        "interruption": {
            "enabled": True,
            "mode": "vad",
            "discard_audio_if_uninterruptible": True,
            "min_duration": 0.35,
            "min_words": 1,
            "resume_false_interruption": True,
                "false_interruption_timeout": 1.2,
            "backchannel_boundary": 0.8,
        },
        "preemptive_generation": {
            "enabled": True,
            "preemptive_tts": False,
            "max_speech_duration": 10.0,
            "max_retries": 3,
        },
    }
    assert StubSession.last_instance.kwargs["max_tool_steps"] == 1
    assert "allow_interruptions" not in StubSession.last_instance.kwargs
    assert "min_endpointing_delay" not in StubSession.last_instance.kwargs
    assert "max_endpointing_delay" not in StubSession.last_instance.kwargs
    assert "resume_false_interruption" not in StubSession.last_instance.kwargs

    StubSession.last_instance.handlers["close"](SimpleNamespace(reason="client"))
    await asyncio.wait_for(task, timeout=1)
