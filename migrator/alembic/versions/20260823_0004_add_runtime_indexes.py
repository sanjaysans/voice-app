"""add runtime indexes for workspace call access

Revision ID: 20260823_0004
Revises: 20260822_0003
Create Date: 2026-08-23 13:15:00
"""

from alembic import op

from voice_backend.schema import DATABASE_SCHEMA

revision = "20260823_0004"
down_revision = "20260822_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None

    op.create_index(
        "ix_calls_tenant_workspace_created",
        "calls",
        ["tenant_id", "workspace_id", "created_at"],
        unique=False,
        schema=schema,
    )
    op.create_index(
        "ix_calls_tenant_workspace_test_created",
        "calls",
        ["tenant_id", "workspace_id", "is_test", "created_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None

    op.drop_index("ix_calls_tenant_workspace_test_created", table_name="calls", schema=schema)
    op.drop_index("ix_calls_tenant_workspace_created", table_name="calls", schema=schema)
