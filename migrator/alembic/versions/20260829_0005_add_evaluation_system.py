"""add versioned evaluation suites and results

Revision ID: 20260829_0005
Revises: 20260823_0004
Create Date: 2026-08-29 12:00:00
"""

import sqlalchemy as sa
from alembic import op

from voice_backend.schema import DATABASE_SCHEMA, json_document_type

revision = "20260829_0005"
down_revision = "20260823_0004"
branch_labels = None
depends_on = None


def _schema(bind) -> str | None:
    return DATABASE_SCHEMA if bind.dialect.name == "postgresql" else None


def upgrade() -> None:
    schema = _schema(op.get_bind())
    op.create_table(
        "eval_suites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("agent_definition_id", sa.Uuid(), nullable=False),
        sa.Column("suite_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_definition_id"], ["agent_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "workspace_id", "suite_key", name="uq_eval_suites_key"),
        schema=schema,
    )
    op.create_index(
        "ix_eval_suites_tenant_workspace_updated",
        "eval_suites",
        ["tenant_id", "workspace_id", "updated_at"],
        schema=schema,
    )
    op.create_table(
        "eval_suite_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("suite_id", sa.Uuid(), nullable=False),
        sa.Column("agent_version_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("execution_defaults", json_document_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["suite_id"], ["eval_suites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_version_id"], ["agent_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("suite_id", "version_number", name="uq_eval_suite_versions_number"),
        schema=schema,
    )
    op.create_table(
        "eval_cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("suite_id", sa.Uuid(), nullable=False),
        sa.Column("case_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["suite_id"], ["eval_suites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("suite_id", "case_key", name="uq_eval_cases_key"),
        schema=schema,
    )
    op.create_table(
        "eval_case_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("scenario", json_document_type, nullable=False),
        sa.Column("expected_behavior", json_document_type, nullable=False),
        sa.Column("assertions", json_document_type, nullable=False),
        sa.Column("rubric", json_document_type, nullable=False),
        sa.Column("caller_config", json_document_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["eval_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_id", "version_number", name="uq_eval_case_versions_number"),
        schema=schema,
    )
    op.create_table(
        "eval_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("suite_id", sa.Uuid(), nullable=False),
        sa.Column("suite_version_id", sa.Uuid(), nullable=False),
        sa.Column("execution_mode", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("total_cases", sa.Integer(), nullable=False),
        sa.Column("passed_cases", sa.Integer(), nullable=False),
        sa.Column("failed_cases", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("config_snapshot", json_document_type, nullable=False),
        sa.Column("summary", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suite_id"], ["eval_suites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suite_version_id"], ["eval_suite_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_eval_runs_tenant_workspace_created",
        "eval_runs",
        ["tenant_id", "workspace_id", "created_at"],
        schema=schema,
    )
    op.create_table(
        "eval_case_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("case_version_id", sa.Uuid(), nullable=False),
        sa.Column("call_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("failure_summary", sa.String(length=1000), nullable=False),
        sa.Column("evidence", json_document_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["eval_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["case_version_id"], ["eval_case_versions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index("ix_eval_case_runs_run_status", "eval_case_runs", ["run_id", "status"], schema=schema)
    op.create_table(
        "eval_assertion_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_run_id", sa.Uuid(), nullable=False),
        sa.Column("assertion_key", sa.String(length=120), nullable=False),
        sa.Column("assertion_type", sa.String(length=32), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("critical", sa.Boolean(), nullable=False),
        sa.Column("expected", json_document_type, nullable=False),
        sa.Column("actual", json_document_type, nullable=False),
        sa.Column("explanation", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["case_run_id"], ["eval_case_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_table(
        "eval_metric_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_run_id", sa.Uuid(), nullable=False),
        sa.Column("metric_key", sa.String(length=120), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("explanation", sa.String(length=1000), nullable=False),
        sa.Column("judge_metadata", json_document_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["case_run_id"], ["eval_case_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema(op.get_bind())
    for table in (
        "eval_metric_results",
        "eval_assertion_results",
        "eval_case_runs",
        "eval_runs",
        "eval_case_versions",
        "eval_cases",
        "eval_suite_versions",
        "eval_suites",
    ):
        op.drop_table(table, schema=schema)
