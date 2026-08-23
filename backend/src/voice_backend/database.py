from collections.abc import Generator
from functools import lru_cache

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from voice_backend.config import Settings, get_settings
from voice_backend.schema import build_engine_connect_args, configure_engine


@lru_cache(maxsize=8)
def _create_session_factory(database_url: str, *, pool_pre_ping: bool) -> sessionmaker[Session]:
    connect_args = build_engine_connect_args(database_url)
    engine = create_engine(
        database_url,
        future=True,
        pool_pre_ping=pool_pre_ping,
        connect_args=connect_args,
    )
    configure_engine(engine, database_url)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def create_session_factory(settings: Settings | None = None) -> sessionmaker[Session]:
    resolved_settings = settings or get_settings()
    return _create_session_factory(
        resolved_settings.database_url,
        pool_pre_ping=resolved_settings.environment == "prod",
    )


def configure_database(app, settings: Settings) -> None:
    app.state.session_factory = create_session_factory(settings)


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
