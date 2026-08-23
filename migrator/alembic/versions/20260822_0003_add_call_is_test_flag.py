"""add call is_test flag

Revision ID: 20260822_0003
Revises: 20260822_0002
Create Date: 2026-08-22 23:15:00
"""

import sqlalchemy as sa
from alembic import op

from voice_backend.schema import DATABASE_SCHEMA

revision = "20260822_0003"
down_revision = "20260822_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None

    op.add_column(
        "calls",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema=schema,
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None

    op.drop_column("calls", "is_test", schema=schema)
