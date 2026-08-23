from __future__ import annotations

import json
from base64 import urlsafe_b64encode
from hashlib import sha256
from typing import Any

from cryptography.fernet import Fernet

from voice_backend.config import Settings, get_settings

ENCRYPTED_VALUE_MARKER = "__voice_encrypted__"
RUNTIME_METADATA_ENCODING = "voice-runtime-fernet-v1"
SECRET_CONFIG_KEYS = {
    "api_key",
    "auth_token",
    "client_secret",
    "signing_secret",
    "token",
}


def _build_fernet(settings: Settings | None = None) -> Fernet:
    resolved_settings = settings or get_settings()
    key_material = resolved_settings.secret_encryption_key
    derived_key = urlsafe_b64encode(sha256(key_material.encode("utf-8")).digest())
    return Fernet(derived_key)


def is_secret_config_key(key: str) -> bool:
    normalized = key.strip().lower()
    if not normalized or normalized.endswith("_ref") or normalized.endswith("_preview"):
        return False
    return (
        normalized in SECRET_CONFIG_KEYS
        or normalized.endswith("_secret")
        or normalized.endswith("_token")
    )


def encrypt_secret_value(value: str, settings: Settings | None = None) -> dict[str, str]:
    ciphertext = _build_fernet(settings).encrypt(value.encode("utf-8")).decode("utf-8")
    return {
        ENCRYPTED_VALUE_MARKER: "true",
        "ciphertext": ciphertext,
    }


def decrypt_secret_value(value: dict[str, Any], settings: Settings | None = None) -> str:
    ciphertext = str(value.get("ciphertext", ""))
    return _build_fernet(settings).decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def encrypt_provider_config(
    config: dict[str, object],
    settings: Settings | None = None,
) -> dict[str, object]:
    encrypted: dict[str, object] = {}
    for key, value in config.items():
        if is_secret_config_key(key) and isinstance(value, str) and value.strip():
            encrypted[key] = encrypt_secret_value(value.strip(), settings)
            continue
        encrypted[key] = value
    return encrypted


def decrypt_provider_config(
    config: dict[str, object],
    settings: Settings | None = None,
) -> dict[str, object]:
    decrypted: dict[str, object] = {}
    for key, value in config.items():
        if (
            is_secret_config_key(key)
            and isinstance(value, dict)
            and value.get(ENCRYPTED_VALUE_MARKER) == "true"
        ):
            decrypted[key] = decrypt_secret_value(value, settings)
            continue
        decrypted[key] = value
    return decrypted


def build_provider_config_preview(config: dict[str, object]) -> dict[str, object]:
    preview: dict[str, object] = {}
    decrypted = decrypt_provider_config(config)
    for key in sorted(decrypted.keys()):
        if is_secret_config_key(key):
            continue
        preview[key] = decrypted[key]
    return preview


def encrypt_runtime_metadata(metadata: str, settings: Settings | None = None) -> str:
    payload = {
        "encoding": RUNTIME_METADATA_ENCODING,
        "ciphertext": _build_fernet(settings).encrypt(metadata.encode("utf-8")).decode("utf-8"),
    }
    return json.dumps(payload)
