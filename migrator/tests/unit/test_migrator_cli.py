import argparse

from alembic.config import Config

from voice_migrator import cli
from voice_migrator.config import Settings


def test_alembic_config_uses_project_root_and_database_url() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:pass@localhost:5432/db")
    config = cli._alembic_config(settings)

    assert config.config_file_name == str(settings.project_root / "migrator" / "alembic.ini")
    assert config.get_main_option("sqlalchemy.url") == settings.database_url


def test_run_dispatches_upgrade(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_upgrade(config: Config, revision: str) -> None:
        captured["config"] = config
        captured["revision"] = revision

    monkeypatch.setattr(cli.command, "upgrade", fake_upgrade)
    config = Config()

    cli.run(argparse.Namespace(command="upgrade", revision="head"), config)

    assert captured == {"config": config, "revision": "head"}


def test_run_dispatches_downgrade(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_downgrade(config: Config, revision: str) -> None:
        captured["config"] = config
        captured["revision"] = revision

    monkeypatch.setattr(cli.command, "downgrade", fake_downgrade)
    config = Config()

    cli.run(argparse.Namespace(command="downgrade", revision="-1"), config)

    assert captured == {"config": config, "revision": "-1"}


def test_run_dispatches_current(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_current(config: Config) -> None:
        captured["config"] = config

    monkeypatch.setattr(cli.command, "current", fake_current)
    config = Config()

    cli.run(argparse.Namespace(command="current"), config)

    assert captured == {"config": config}
