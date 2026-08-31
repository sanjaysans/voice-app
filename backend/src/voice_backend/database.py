from collections.abc import Generator
from functools import lru_cache

from fastapi import Request
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from voice_backend.config import Settings, get_settings
from voice_backend.logging import get_logger
from voice_backend.schema import build_engine_connect_args, configure_engine

logger = get_logger(__name__)


@lru_cache(maxsize=8)
def _create_session_factory(
    database_url: str,
    *,
    pool_pre_ping: bool,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_timeout: int = 10,
    pool_recycle: int = 1800,
) -> sessionmaker[Session]:
    connect_args = build_engine_connect_args(database_url)
    pool_options = {}
    if database_url.startswith("postgresql"):
        pool_options = {
            "pool_size": pool_size,
            "max_overflow": max_overflow,
            "pool_timeout": pool_timeout,
            "pool_recycle": pool_recycle,
        }
    engine = create_engine(
        database_url,
        future=True,
        pool_pre_ping=pool_pre_ping,
        connect_args=connect_args,
        **pool_options,
    )
    configure_engine(engine, database_url)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def create_session_factory(settings: Settings | None = None) -> sessionmaker[Session]:
    resolved_settings = settings or get_settings()
    return _create_session_factory(
        resolved_settings.database_url,
        pool_pre_ping=resolved_settings.environment == "prod",
        pool_size=resolved_settings.database_pool_size,
        max_overflow=resolved_settings.database_max_overflow,
        pool_timeout=resolved_settings.database_pool_timeout_seconds,
        pool_recycle=resolved_settings.database_pool_recycle_seconds,
    )


def configure_database(app, settings: Settings) -> None:
    session_factory = create_session_factory(settings)
    app.state.session_factory = session_factory
    try:
        with session_factory() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - exercised against external databases
        logger.warning(
            "backend.database.prewarm_failed",
            error=exc.__class__.__name__,
        )


def get_session() -> Generator[Session, None, None]:
    raise RuntimeError(
        "request-scoped session dependency should be resolved through get_request_session"
    )


def get_request_session(request: Request) -> Generator[Session, None, None]:
    factory = request.app.state.session_factory
    session = factory()
    try:
        yield session
    finally:
        session.close()
