import asyncio
from types import SimpleNamespace

import pytest

from voice_pipeline.config import Settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.domain.workflow import WorkflowGraph
from voice_pipeline.interfaces.livekit.eval_caller import (
    MAX_AGENT_TURNS,
    _item_role,
)
from voice_pipeline.interfaces.livekit.worker import (
    _build_transition_tool,
    _run_worker_entrypoint,
    _speak,
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
async def test_terminal_transition_generates_closing_response_and_shuts_down() -> None:
    class StubSession:
        def __init__(self) -> None:
            self.shutdown_called = False

        def generate_reply(self, **kwargs):
            return None

        def shutdown(self, **kwargs):
            self.shutdown_called = True

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
    await asyncio.sleep(0)

    assert "call is ending" in result
    assert workflow.ended is True
    assert session.shutdown_called is True


def test_worker_bootstrap_surfaces_default_browser_providers() -> None:
    bootstrap = build_worker_bootstrap(Settings())

    assert bootstrap["bootstrap"]["providers"]["stt"] == "deepgram-stt"
    assert bootstrap["bootstrap"]["providers"]["llm"] == "openai-responses-llm"
    assert bootstrap["bootstrap"]["providers"]["tts"] == "cartesia-tts"
    assert bootstrap["bootstrap"]["providers"]["vad"] == "silero-vad"


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


def test_eval_caller_uses_conversation_item_role_for_local_speech() -> None:
    event = SimpleNamespace(item=SimpleNamespace(role="assistant"))

    assert _item_role(event) == "assistant"
    assert MAX_AGENT_TURNS == 8


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
                max_endpointing_ms=1500,
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
        "endpointing": {"min_delay": 0.3, "max_delay": 1.5},
        "interruption": {"enabled": True, "resume_false_interruption": True},
    }
    assert "allow_interruptions" not in StubSession.last_instance.kwargs
    assert "min_endpointing_delay" not in StubSession.last_instance.kwargs
    assert "max_endpointing_delay" not in StubSession.last_instance.kwargs
    assert "resume_false_interruption" not in StubSession.last_instance.kwargs

    StubSession.last_instance.handlers["close"](SimpleNamespace(reason="client"))
    await asyncio.wait_for(task, timeout=1)
