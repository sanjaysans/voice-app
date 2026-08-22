from __future__ import annotations

import argparse

from alembic import command
from alembic.config import Config

from voice_migrator.config import get_settings
from voice_migrator.logging import configure_logging, get_logger


def _alembic_config(settings=None) -> Config:
    resolved_settings = settings or get_settings()
    config = Config(str(resolved_settings.project_root / "migrator" / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", resolved_settings.database_url)
    return config


def run(args: argparse.Namespace, config: Config) -> None:
    logger = get_logger(__name__)

    if args.command == "upgrade":
        logger.info("migration.upgrade", revision=args.revision)
        command.upgrade(config, args.revision)
        return

    if args.command == "downgrade":
        logger.info("migration.downgrade", revision=args.revision)
        command.downgrade(config, args.revision)
        return

    logger.info("migration.current")
    command.current(config)


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(prog="voice-migrate")
    subparsers = parser.add_subparsers(dest="command", required=True)

    upgrade_parser = subparsers.add_parser("upgrade")
    upgrade_parser.add_argument("revision", nargs="?", default="head")

    downgrade_parser = subparsers.add_parser("downgrade")
    downgrade_parser.add_argument("revision")

    subparsers.add_parser("current")

    args = parser.parse_args()
    config = _alembic_config()
    run(args, config)
