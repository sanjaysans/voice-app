from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from uuid import UUID


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _urlsafe_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def hash_password(password: str, *, iterations: int) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_urlsafe_encode(salt)}${_urlsafe_encode(derived)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_text, hash_text = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False

    iterations = int(iteration_text)
    salt = _urlsafe_decode(salt_text)
    expected = _urlsafe_decode(hash_text)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


@dataclass(frozen=True)
class SessionPayload:
    user_id: UUID
    expires_at: int


def create_session_token(
    user_id: UUID,
    *,
    secret: str,
    ttl_seconds: int,
    now: int | None = None,
) -> str:
    issued_at = now or int(time.time())
    payload = {
        "sub": str(user_id),
        "exp": issued_at + ttl_seconds,
    }
    payload_text = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_segment = _urlsafe_encode(payload_text)
    signature = hmac.new(secret.encode("utf-8"), payload_segment.encode("ascii"), hashlib.sha256)
    signature_segment = _urlsafe_encode(signature.digest())
    return f"{payload_segment}.{signature_segment}"


def decode_session_token(
    token: str, *, secret: str, now: int | None = None
) -> SessionPayload | None:
    try:
        payload_segment, signature_segment = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        payload_segment.encode("ascii"),
        hashlib.sha256,
    )
    if not hmac.compare_digest(signature_segment, _urlsafe_encode(expected_signature.digest())):
        return None

    try:
        payload = json.loads(_urlsafe_decode(payload_segment).decode("utf-8"))
        user_id = UUID(str(payload["sub"]))
        expires_at = int(payload["exp"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None

    if expires_at <= (now or int(time.time())):
        return None

    return SessionPayload(user_id=user_id, expires_at=expires_at)
