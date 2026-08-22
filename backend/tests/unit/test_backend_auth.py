import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from voice_backend.app import create_app
from voice_backend.database import get_request_session
from voice_backend.security import (
    create_session_token,
    decode_session_token,
    hash_password,
    verify_password,
)
from voice_backend.services.authentication import AuthenticationService


def test_password_hash_round_trip() -> None:
    hashed = hash_password("voice-demo-password", iterations=1_000)

    assert verify_password("voice-demo-password", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_session_token_round_trip() -> None:
    token = create_session_token(
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        secret="test-secret",
        ttl_seconds=60,
        now=100,
    )

    payload = decode_session_token(token, secret="test-secret", now=120)

    assert payload is not None
    assert str(payload.user_id) == "00000000-0000-0000-0000-000000000001"
    assert payload.expires_at == 160


def test_authentication_service_returns_session_for_valid_credentials(
    session, seeded_domain
) -> None:
    auth_session = AuthenticationService(session).authenticate(
        seeded_domain["user"].email,
        "voice-demo-password",
    )

    assert auth_session is not None
    assert auth_session.user.email == "admin@voice.local"
    assert auth_session.active_membership is not None
    assert auth_session.active_membership.workspace_name == "Sales"


@pytest.mark.asyncio
async def test_auth_endpoints_login_me_and_logout(session, seeded_domain) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        login_response = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@voice.local", "password": "voice-demo-password"},
        )
        me_response = await client.get("/api/v1/auth/me")
        logout_response = await client.post("/api/v1/auth/logout")
        me_after_logout = await client.get("/api/v1/auth/me")

        assert login_response.status_code == 200
        assert login_response.json()["user"]["email"] == "admin@voice.local"
        assert me_response.status_code == 200
        assert me_response.json()["active_membership"]["workspace_name"] == "Sales"
        assert logout_response.status_code == 204
        assert me_after_logout.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_requires_a_session_cookie(session) -> None:
    app = create_app()
    app.dependency_overrides[get_request_session] = lambda: session
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/auth/me")

        assert response.status_code == 401
