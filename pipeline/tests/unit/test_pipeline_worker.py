import asyncio
from types import SimpleNamespace

import pytest

from voice_pipeline.config import Settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.interfaces.livekit.worker import (
    _run_worker_entrypoint,
    build_worker_bootstrap,
    build_worker_options_kwargs,
)


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
