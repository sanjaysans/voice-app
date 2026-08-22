from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, func, inspect, select, text

from voice_backend.models import Base
from voice_backend.schema import build_engine_connect_args
from voice_migrator.config import get_settings
from voice_migrator.logging import configure_logging, get_logger

SEED_REQUIRED_TABLES = ("users", "tenants", "workspaces")
EXPECTED_INDEXES = {
    "provider_accounts": {"ix_provider_accounts_tenant_kind"},
    "calls": {"ix_calls_tenant_created"},
    "call_events": {"ix_call_events_call_occurred"},
}


class DatabaseVerificationError(RuntimeError):
    pass


def expected_alembic_heads(project_root: Path) -> set[str]:
    config = Config(str(project_root / "migrator" / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    return set(script.get_heads())


def verify_database(database_url: str, project_root: Path, require_seed: bool = True) -> dict[str, int]:
    engine = create_engine(database_url, future=True, connect_args=build_engine_connect_args(database_url))
    inspector = inspect(engine)
    present_tables = set(inspector.get_table_names())
    required_tables = set(Base.metadata.tables)
    missing_tables = sorted(required_tables - present_tables)
    if missing_tables:
        raise DatabaseVerificationError(f"missing tables: {', '.join(missing_tables)}")

    if "alembic_version" not in present_tables:
        raise DatabaseVerificationError("missing table: alembic_version")

    expected_heads = expected_alembic_heads(project_root)
    with engine.begin() as connection:
        current_head = connection.execute(text("select version_num from alembic_version")).scalar_one_or_none()
    if current_head not in expected_heads:
        raise DatabaseVerificationError(
            f"unexpected alembic head: expected one of {sorted(expected_heads)}, found {current_head}"
        )

    for table_name, expected_indexes in EXPECTED_INDEXES.items():
        present_indexes = {item["name"] for item in inspector.get_indexes(table_name)}
        missing_indexes = sorted(expected_indexes - present_indexes)
        if missing_indexes:
            raise DatabaseVerificationError(
                f"missing indexes for {table_name}: {', '.join(missing_indexes)}"
            )

    if not require_seed:
        return {}

    counts: dict[str, int] = {}
    with engine.begin() as connection:
        for table_name in SEED_REQUIRED_TABLES:
            table = Base.metadata.tables[table_name]
            counts[table_name] = int(connection.execute(select(func.count()).select_from(table)).scalar_one())

    empty_tables = [table_name for table_name, count in counts.items() if count == 0]
    if empty_tables:
        raise DatabaseVerificationError(f"seed data missing for tables: {', '.join(empty_tables)}")

    return counts


def main() -> None:
    configure_logging()
    logger = get_logger(__name__)
    settings = get_settings()
    counts = verify_database(settings.database_url or "", settings.project_root)
    logger.info("database.verify.completed", environment=settings.environment, **counts)
