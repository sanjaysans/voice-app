"""initial baseline

Revision ID: 20260822_0001
Revises:
Create Date: 2026-08-22 12:00:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from voice_backend.schema import DATABASE_SCHEMA

revision = "20260822_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(f"create schema if not exists {DATABASE_SCHEMA}")
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_workspaces_tenant_name"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "tenant_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "workspace_id", "user_id", name="uq_memberships_workspace_user"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "provider_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider_kind", sa.String(length=32), nullable=False),
        sa.Column("vendor_name", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "provider_kind", "label", name="uq_provider_accounts_label"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "agent_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "agent_key", name="uq_agent_definitions_key"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "agent_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_definition_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.agent_definitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("pipeline_mode", sa.String(length=32), nullable=False),
        sa.Column("routing_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("vendor_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("agent_definition_id", "version_number", name="uq_agent_versions_number"),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.agent_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("from_number", sa.String(length=32), nullable=True),
        sa.Column("to_number", sa.String(length=32), nullable=True),
        sa.Column("resolved_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=DATABASE_SCHEMA,
    )
    op.create_table(
        "call_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "call_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.calls.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{DATABASE_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=DATABASE_SCHEMA,
    )

    op.create_index(
        "ix_provider_accounts_tenant_kind",
        "provider_accounts",
        ["tenant_id", "provider_kind"],
        schema=DATABASE_SCHEMA,
    )
    op.create_index("ix_calls_tenant_created", "calls", ["tenant_id", "created_at"], schema=DATABASE_SCHEMA)
    op.create_index(
        "ix_call_events_call_occurred",
        "call_events",
        ["call_id", "occurred_at"],
        schema=DATABASE_SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_call_events_call_occurred", table_name="call_events", schema=DATABASE_SCHEMA)
    op.drop_index("ix_calls_tenant_created", table_name="calls", schema=DATABASE_SCHEMA)
    op.drop_index("ix_provider_accounts_tenant_kind", table_name="provider_accounts", schema=DATABASE_SCHEMA)
    op.drop_table("call_events", schema=DATABASE_SCHEMA)
    op.drop_table("calls", schema=DATABASE_SCHEMA)
    op.drop_table("agent_versions", schema=DATABASE_SCHEMA)
    op.drop_table("agent_definitions", schema=DATABASE_SCHEMA)
    op.drop_table("provider_accounts", schema=DATABASE_SCHEMA)
    op.drop_table("tenant_memberships", schema=DATABASE_SCHEMA)
    op.drop_table("workspaces", schema=DATABASE_SCHEMA)
    op.drop_table("users", schema=DATABASE_SCHEMA)
    op.drop_table("tenants", schema=DATABASE_SCHEMA)
    op.execute(f"drop schema if exists {DATABASE_SCHEMA}")
