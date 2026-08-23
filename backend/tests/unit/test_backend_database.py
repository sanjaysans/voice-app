from fastapi import FastAPI

from voice_backend.config import Settings
from voice_backend.database import (
    _create_session_factory,
    configure_database,
    create_session_factory,
)


def test_create_session_factory_supports_sqlite_urls() -> None:
    factory = create_session_factory(Settings(database_url="sqlite+pysqlite:///:memory:"))

    with factory() as session:
        assert session.bind is not None


def test_create_session_factory_supports_postgres_urls() -> None:
    factory = create_session_factory(
        Settings(database_url="postgresql+psycopg://voice:voice@localhost:5432/voice")
    )

    assert factory.kw["bind"] is not None


def test_session_factory_is_reused_for_same_database_url() -> None:
    factory_one = _create_session_factory("sqlite+pysqlite:///:memory:", pool_pre_ping=False)
    factory_two = _create_session_factory("sqlite+pysqlite:///:memory:", pool_pre_ping=False)

    assert factory_one is factory_two


def test_configure_database_binds_session_factory_to_app() -> None:
    app = FastAPI()
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")

    configure_database(app, settings)

    assert app.state.session_factory is create_session_factory(settings)
