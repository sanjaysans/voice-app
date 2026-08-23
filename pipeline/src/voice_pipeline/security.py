from __future__ import annotations

import json
from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet

from voice_pipeline.config import Settings, get_settings

RUNTIME_METADATA_ENCODING = "voice-runtime-fernet-v1"


def _build_fernet(settings: Settings | None = None) -> Fernet:
    resolved_settings = settings or get_settings()
    derived_key = urlsafe_b64encode(
        sha256(resolved_settings.secret_encryption_key.encode("utf-8")).digest()
    )
    return Fernet(derived_key)


def decrypt_runtime_metadata(metadata: str, settings: Settings | None = None) -> str:
    try:
        payload = json.loads(metadata)
    except json.JSONDecodeError:
        return metadata
    if payload.get("encoding") != RUNTIME_METADATA_ENCODING:
        return metadata
    ciphertext = str(payload.get("ciphertext", ""))
    return _build_fernet(settings).decrypt(ciphertext.encode("utf-8")).decode("utf-8")
