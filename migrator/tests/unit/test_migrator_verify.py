import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from voice_backend.models import Base
from voice_migrator.verify import DatabaseVerificationError, expected_alembic_heads, verify_database


def test_verify_database_returns_seed_counts_for_initialized_database(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'initialized.db'}"
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(engine)
    head = next(iter(expected_alembic_heads(Path(__file__).resolve().parents[3])))

    users_table = Base.metadata.tables["users"]
    tenants_table = Base.metadata.tables["tenants"]
    workspaces_table = Base.metadata.tables["workspaces"]

    tenant_id = uuid.uuid4()
    with engine.begin() as connection:
        connection.execute(text("create table alembic_version (version_num varchar(32) not null)"))
        connection.execute(
            text("insert into alembic_version (version_num) values (:version_num)"),
            {"version_num": head},
        )
        connection.execute(
            users_table.insert().values(
                id=uuid.uuid4(),
                email="admin@voice.local",
                display_name="Voice Admin",
                password_hash="hashed",
                is_platform_admin=True,
            )
        )
        connection.execute(
            tenants_table.insert().values(
                id=tenant_id,
                slug="voice-demo",
                name="Voice Demo",
                status="active",
            )
        )
        connection.execute(
            workspaces_table.insert().values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                name="Default Workspace",
                is_default=True,
            )
        )

    counts = verify_database(database_url, Path(__file__).resolve().parents[3])

    assert counts == {"tenants": 1, "users": 1, "workspaces": 1}


def test_verify_database_raises_when_required_tables_are_missing(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'missing.db'}"

    with pytest.raises(DatabaseVerificationError, match="missing tables"):
        verify_database(database_url, Path(__file__).resolve().parents[3])


def test_verify_database_raises_when_seed_tables_are_empty(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'empty.db'}"
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(engine)
    head = next(iter(expected_alembic_heads(Path(__file__).resolve().parents[3])))
    with engine.begin() as connection:
        connection.execute(text("create table alembic_version (version_num varchar(32) not null)"))
        connection.execute(
            text("insert into alembic_version (version_num) values (:version_num)"),
            {"version_num": head},
        )

    with pytest.raises(DatabaseVerificationError, match="seed data missing"):
        verify_database(database_url, Path(__file__).resolve().parents[3])


def test_verify_database_raises_when_alembic_head_is_wrong(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'wrong-head.db'}"
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("create table alembic_version (version_num varchar(32) not null)"))
        connection.execute(
            text("insert into alembic_version (version_num) values (:version_num)"),
            {"version_num": "wrong_head"},
        )

    with pytest.raises(DatabaseVerificationError, match="unexpected alembic head"):
        verify_database(database_url, Path(__file__).resolve().parents[3], require_seed=False)
