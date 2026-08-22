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
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    schema = DATABASE_SCHEMA if is_postgres else None
    uuid_type = postgresql.UUID(as_uuid=True) if is_postgres else sa.Uuid()
    json_type = postgresql.JSONB(astext_type=sa.Text()) if is_postgres else sa.JSON()
    json_default = sa.text("'{}'::jsonb") if is_postgres else sa.text("'{}'")

    def qualified(name: str) -> str:
        return f"{schema}.{name}" if schema else name

    if schema:
        op.execute(f"create schema if not exists {schema}")
    op.create_table(
        "tenants",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        schema=schema,
    )
    op.create_table(
        "users",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column(
            "is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
        schema=schema,
    )
    op.create_table(
        "workspaces",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "name", name="uq_workspaces_tenant_name"),
        schema=schema,
    )
    op.create_table(
        "tenant_memberships",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('workspaces')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('users')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "tenant_id", "workspace_id", "user_id", name="uq_memberships_workspace_user"
        ),
        schema=schema,
    )
    op.create_table(
        "provider_accounts",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider_kind", sa.String(length=32), nullable=False),
        sa.Column("vendor_name", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column(
            "config",
            json_type,
            nullable=False,
            server_default=json_default,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "tenant_id", "provider_kind", "label", name="uq_provider_accounts_label"
        ),
        schema=schema,
    )
    op.create_table(
        "agent_definitions",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('workspaces')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "tenant_id", "workspace_id", "agent_key", name="uq_agent_definitions_key"
        ),
        schema=schema,
    )
    op.create_table(
        "agent_versions",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "agent_definition_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('agent_definitions')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("pipeline_mode", sa.String(length=32), nullable=False),
        sa.Column(
            "routing_config",
            json_type,
            nullable=False,
            server_default=json_default,
        ),
        sa.Column(
            "vendor_config",
            json_type,
            nullable=False,
            server_default=json_default,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "agent_definition_id", "version_number", name="uq_agent_versions_number"
        ),
        schema=schema,
    )
    op.create_table(
        "calls",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('workspaces')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_version_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('agent_versions')}.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("from_number", sa.String(length=32), nullable=True),
        sa.Column("to_number", sa.String(length=32), nullable=True),
        sa.Column(
            "resolved_config",
            json_type,
            nullable=False,
            server_default=json_default,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        schema=schema,
    )
    op.create_table(
        "call_events",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "call_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('calls')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            uuid_type,
            sa.ForeignKey(f"{qualified('tenants')}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column(
            "payload",
            json_type,
            nullable=False,
            server_default=json_default,
        ),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        schema=schema,
    )

    op.create_index(
        "ix_provider_accounts_tenant_kind",
        "provider_accounts",
        ["tenant_id", "provider_kind"],
        schema=schema,
    )
    op.create_index(
        "ix_calls_tenant_created", "calls", ["tenant_id", "created_at"], schema=schema
    )
    op.create_index(
        "ix_call_events_call_occurred",
        "call_events",
        ["call_id", "occurred_at"],
        schema=schema,
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema = DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None

    op.drop_index("ix_call_events_call_occurred", table_name="call_events", schema=schema)
    op.drop_index("ix_calls_tenant_created", table_name="calls", schema=schema)
    op.drop_index(
        "ix_provider_accounts_tenant_kind", table_name="provider_accounts", schema=schema
    )
    op.drop_table("call_events", schema=schema)
    op.drop_table("calls", schema=schema)
    op.drop_table("agent_versions", schema=schema)
    op.drop_table("agent_definitions", schema=schema)
    op.drop_table("provider_accounts", schema=schema)
    op.drop_table("tenant_memberships", schema=schema)
    op.drop_table("workspaces", schema=schema)
    op.drop_table("users", schema=schema)
    op.drop_table("tenants", schema=schema)
    if schema:
        op.execute(f"drop schema if exists {schema}")
