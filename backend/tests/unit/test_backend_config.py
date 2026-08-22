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
