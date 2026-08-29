from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from voice_backend import app as backend_app
from voice_backend import dev as backend_dev
from voice_backend.app import create_app
from voice_backend.config import Settings


def test_check_database_returns_success_when_query_succeeds(monkeypatch) -> None:
    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query: str) -> None:
            assert query == "select 1"

        def fetchone(self) -> tuple[int]:
            return (1,)

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self) -> FakeCursor:
            return FakeCursor()

    monkeypatch.setattr(backend_app.psycopg, "connect", lambda *args, **kwargs: FakeConnection())

    is_ready, detail = backend_app._check_database(Settings())

    assert is_ready is True
    assert detail == "database reachable"


def test_check_database_returns_failure_when_connection_raises(monkeypatch) -> None:
    def failing_connect(*args, **kwargs):
        raise RuntimeError("database offline")

    monkeypatch.setattr(backend_app.psycopg, "connect", failing_connect)

    is_ready, detail = backend_app._check_database(Settings())

    assert is_ready is False
    assert "database offline" in detail


@pytest.mark.parametrize(
    ("environment", "should_reload"), [("dev", True), ("test", False), ("prod", False)]
)
def test_backend_dev_server_reloads_only_in_dev(monkeypatch, environment, should_reload) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        backend_dev,
        "get_settings",
        lambda: SimpleNamespace(environment=environment, host="127.0.0.1", port=8100),
    )
    monkeypatch.setattr(backend_dev.uvicorn, "run", lambda *args, **kwargs: captured.update(kwargs))

    backend_dev.main()

    assert captured["reload"] is should_reload


@pytest.mark.asyncio
async def test_ready_endpoint_returns_503_when_database_is_unreachable(monkeypatch) -> None:
    monkeypatch.setattr(
        backend_app, "_check_database", lambda settings: (False, "database offline")
    )
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings())),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 503
        assert response.json() == {
            "status": "degraded",
            "service": "voice-backend",
            "detail": "database offline",
        }


@pytest.mark.asyncio
async def test_ready_endpoint_returns_200_when_database_is_reachable(monkeypatch) -> None:
    monkeypatch.setattr(
        backend_app, "_check_database", lambda settings: (True, "database reachable")
    )
    async with AsyncClient(
        transport=ASGITransport(app=create_app(Settings())),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"
