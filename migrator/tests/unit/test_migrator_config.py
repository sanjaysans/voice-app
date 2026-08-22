from pathlib import Path

import pytest

from voice_migrator.config import Settings


def test_project_root_points_to_repository_root() -> None:
    settings = Settings(_env_file=None)

    assert settings.project_root == Path(__file__).resolve().parents[3]


def test_migrator_uses_environment_specific_database_url() -> None:
    settings = Settings(
        _env_file=None,
        environment="prod",
        database_url_prod="postgresql+psycopg://voice:prod@db.example.com:5432/proddb",
        admin_password="strong-password",
    )

    assert settings.database_url == "postgresql+psycopg://voice:prod@db.example.com:5432/proddb"


def test_migrator_test_environment_falls_back_to_dev_database_url() -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url_dev="postgresql+psycopg://voice:dev@db.example.com:5432/devdb",
    )

    assert settings.database_url == "postgresql+psycopg://voice:dev@db.example.com:5432/devdb"


def test_invalid_environment_is_rejected() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, environment="staging")


def test_prod_environment_defaults_seed_mode_to_minimal() -> None:
    settings = Settings(
        _env_file=None,
        environment="prod",
        database_url_prod="postgresql+psycopg://voice:prod@db.example.com:5432/proddb",
        admin_password="strong-password",
    )

    assert settings.seed_mode == "minimal"


def test_prod_environment_requires_explicit_admin_password() -> None:
    with pytest.raises(ValueError, match="VOICE_ADMIN_PASSWORD"):
        Settings(
            _env_file=None,
            environment="prod",
            database_url_prod="postgresql+psycopg://voice:prod@db.example.com:5432/proddb",
        )
