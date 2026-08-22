"""add user password hash

Revision ID: 20260822_0002
Revises: 20260822_0001
Create Date: 2026-08-22 13:10:00
"""

import sqlalchemy as sa
from alembic import op

from voice_backend.schema import DATABASE_SCHEMA

revision = "20260822_0002"
down_revision = "20260822_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=False, server_default=""),
        schema=schema,
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None
    op.drop_column("users", "password_hash", schema=schema)
