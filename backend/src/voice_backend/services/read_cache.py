from collections.abc import Hashable
from threading import Lock
from time import monotonic
from typing import TypeVar

CacheValue = TypeVar("CacheValue")

READ_CACHE_TTL_SECONDS = 15.0

_cache_lock = Lock()
_cache: dict[Hashable, tuple[float, object]] = {}


def clear_read_cache() -> None:
    with _cache_lock:
        _cache.clear()


def get_read_cache(key: Hashable) -> CacheValue | None:
    now = monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached is None:
            return None
        expires_at, value = cached
        if expires_at <= now:
            _cache.pop(key, None)
            return None
        return value  # type: ignore[return-value]


def set_read_cache(key: Hashable, value: CacheValue) -> CacheValue:
    with _cache_lock:
        _cache[key] = (monotonic() + READ_CACHE_TTL_SECONDS, value)
    return value
