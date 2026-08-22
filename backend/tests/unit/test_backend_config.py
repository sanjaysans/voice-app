import pytest

from voice_backend.config import Settings


def test_database_dsn_removes_sqlalchemy_driver_suffix() -> None:
    settings = Settings(
        _env_file=None, database_url="postgresql+psycopg://voice:voice@localhost:5432/voice"
    )

    assert settings.database_dsn == "postgresql://voice:voice@localhost:5432/voice"


def test_database_dsn_leaves_plain_postgres_url_unchanged() -> None:
    settings = Settings(
        _env_file=None, database_url="postgresql://voice:voice@localhost:5432/voice"
    )

    assert settings.database_dsn == "postgresql://voice:voice@localhost:5432/voice"


def test_database_url_is_selected_from_environment_specific_value() -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url_test="postgresql+psycopg://voice:test@db.example.com:5432/testdb",
    )

    assert settings.database_url == "postgresql+psycopg://voice:test@db.example.com:5432/testdb"


def test_test_environment_falls_back_to_dev_database_url() -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url_dev="postgresql+psycopg://voice:dev@db.example.com:5432/devdb",
    )

    assert settings.database_url == "postgresql+psycopg://voice:dev@db.example.com:5432/devdb"


def test_prod_environment_requires_explicit_database_url() -> None:
    with pytest.raises(ValueError, match="environment 'prod'"):
        Settings(_env_file=None, environment="prod")


def test_dev_environment_uses_default_session_secret() -> None:
    settings = Settings(_env_file=None, database_url="sqlite+pysqlite:///:memory:")

    assert settings.session_secret == "voice-local-dev-session-secret"


def test_prod_environment_requires_explicit_session_secret() -> None:
    with pytest.raises(ValueError, match="VOICE_SESSION_SECRET"):
        Settings(
            _env_file=None,
            environment="prod",
            database_url="postgresql+psycopg://voice:prod@db.example.com:5432/proddb",
        )


def test_dev_environment_defaults_livekit_to_local_server() -> None:
    settings = Settings(_env_file=None, database_url="sqlite+pysqlite:///:memory:")

    assert settings.livekit_url == "ws://127.0.0.1:7880"
    assert settings.livekit_api_key == "devkey"
    assert settings.livekit_api_secret == "secret"
    assert settings.livekit_configured is True
