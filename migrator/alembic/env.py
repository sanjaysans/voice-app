from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from voice_backend.models import Base
from voice_backend.schema import DATABASE_SCHEMA, POSTGRES_SEARCH_PATH, version_table_schema
from voice_migrator.config import get_settings

config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def migration_context_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {}
    resolved_version_table_schema = version_table_schema(settings.database_url)
    if resolved_version_table_schema is not None:
        kwargs["version_table_schema"] = resolved_version_table_schema
    return kwargs


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **migration_context_kwargs(),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        if settings.database_url.startswith("postgresql"):
            connection.execute(text(f"create schema if not exists {DATABASE_SCHEMA}"))
            connection.execute(text(f"set search_path to {POSTGRES_SEARCH_PATH}"))
            connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            **migration_context_kwargs(),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
