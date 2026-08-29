from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from voice_backend.schema import json_document_type
from voice_backend.schema import metadata as shared_metadata


class Base(DeclarativeBase):
    metadata = shared_metadata


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (UniqueConstraint("slug", name="uq_tenants_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspaces: Mapped[list[Workspace]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    agent_definitions: Mapped[list[AgentDefinition]] = relationship(back_populates="tenant")
    calls: Mapped[list[Call]] = relationship(back_populates="tenant")


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_workspaces_tenant_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="workspaces")
    agent_definitions: Mapped[list[AgentDefinition]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    calls: Mapped[list[Call]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    memberships: Mapped[list[TenantMembership]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class AgentDefinition(Base):
    __tablename__ = "agent_definitions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "workspace_id", "agent_key", name="uq_agent_definitions_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    agent_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tenant: Mapped[Tenant] = relationship(back_populates="agent_definitions")
    workspace: Mapped[Workspace] = relationship(back_populates="agent_definitions")
    versions: Mapped[list[AgentVersion]] = relationship(
        back_populates="agent_definition",
        cascade="all, delete-orphan",
        order_by="AgentVersion.version_number",
    )


class AgentVersion(Base):
    __tablename__ = "agent_versions"
    __table_args__ = (
        UniqueConstraint("agent_definition_id", "version_number", name="uq_agent_versions_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agent_definition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_definitions.id", ondelete="CASCADE")
    )
    version_number: Mapped[int] = mapped_column(Integer)
    pipeline_mode: Mapped[str] = mapped_column(String(32))
    routing_config: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    vendor_config: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agent_definition: Mapped[AgentDefinition] = relationship(back_populates="versions")
    calls: Mapped[list[Call]] = relationship(back_populates="agent_version")


class Call(Base):
    __tablename__ = "calls"
    __table_args__ = (
        Index("ix_calls_tenant_workspace_created", "tenant_id", "workspace_id", "created_at"),
        Index(
            "ix_calls_tenant_workspace_test_created",
            "tenant_id",
            "workspace_id",
            "is_test",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    agent_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    direction: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32))
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    from_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolved_config: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="calls")
    workspace: Mapped[Workspace] = relationship(back_populates="calls")
    agent_version: Mapped[AgentVersion | None] = relationship(back_populates="calls")
    events: Mapped[list[CallEvent]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list[TenantMembership]] = relationship(back_populates="user")


class TenantMembership(Base):
    __tablename__ = "tenant_memberships"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "workspace_id", "user_id", name="uq_memberships_workspace_user"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship()
    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class ProviderAccount(Base):
    __tablename__ = "provider_accounts"
    __table_args__ = (
        Index("ix_provider_accounts_tenant_kind", "tenant_id", "provider_kind"),
        UniqueConstraint("tenant_id", "provider_kind", "label", name="uq_provider_accounts_label"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    provider_kind: Mapped[str] = mapped_column(String(32))
    vendor_name: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    config: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CallEvent(Base):
    __tablename__ = "call_events"
    __table_args__ = (Index("ix_call_events_call_occurred", "call_id", "occurred_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"))
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    call: Mapped[Call] = relationship(back_populates="events")


class EvalSuite(Base):
    __tablename__ = "eval_suites"
    __table_args__ = (
        UniqueConstraint("tenant_id", "workspace_id", "suite_key", name="uq_eval_suites_key"),
        Index("ix_eval_suites_tenant_workspace_updated", "tenant_id", "workspace_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    agent_definition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_definitions.id", ondelete="CASCADE")
    )
    suite_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list[EvalSuiteVersion]] = relationship(
        back_populates="suite",
        cascade="all, delete-orphan",
        order_by="EvalSuiteVersion.version_number",
    )
    cases: Mapped[list[EvalCase]] = relationship(
        back_populates="suite", cascade="all, delete-orphan", order_by="EvalCase.sort_order"
    )


class EvalSuiteVersion(Base):
    __tablename__ = "eval_suite_versions"
    __table_args__ = (
        UniqueConstraint("suite_id", "version_number", name="uq_eval_suite_versions_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    suite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_suites.id", ondelete="CASCADE"))
    agent_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_versions.id", ondelete="RESTRICT")
    )
    version_number: Mapped[int] = mapped_column(Integer)
    execution_defaults: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    suite: Mapped[EvalSuite] = relationship(back_populates="versions")
    agent_version: Mapped[AgentVersion] = relationship()
    runs: Mapped[list[EvalRun]] = relationship(back_populates="suite_version")


class EvalCase(Base):
    __tablename__ = "eval_cases"
    __table_args__ = (UniqueConstraint("suite_id", "case_key", name="uq_eval_cases_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    suite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_suites.id", ondelete="CASCADE"))
    case_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    suite: Mapped[EvalSuite] = relationship(back_populates="cases")
    versions: Mapped[list[EvalCaseVersion]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="EvalCaseVersion.version_number",
    )


class EvalCaseVersion(Base):
    __tablename__ = "eval_case_versions"
    __table_args__ = (
        UniqueConstraint("case_id", "version_number", name="uq_eval_case_versions_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_cases.id", ondelete="CASCADE"))
    version_number: Mapped[int] = mapped_column(Integer)
    scenario: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    expected_behavior: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    assertions: Mapped[list[object]] = mapped_column(json_document_type, default=list)
    rubric: Mapped[list[object]] = mapped_column(json_document_type, default=list)
    caller_config: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped[EvalCase] = relationship(back_populates="versions")
    case_runs: Mapped[list[EvalCaseRun]] = relationship(back_populates="case_version")


class EvalRun(Base):
    __tablename__ = "eval_runs"
    __table_args__ = (
        Index("ix_eval_runs_tenant_workspace_created", "tenant_id", "workspace_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    suite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_suites.id", ondelete="CASCADE"))
    suite_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("eval_suite_versions.id", ondelete="RESTRICT")
    )
    execution_mode: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    total_cases: Mapped[int] = mapped_column(Integer, default=0)
    passed_cases: Mapped[int] = mapped_column(Integer, default=0)
    failed_cases: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float | None] = mapped_column(nullable=True)
    config_snapshot: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    summary: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    suite_version: Mapped[EvalSuiteVersion] = relationship(back_populates="runs")
    case_runs: Mapped[list[EvalCaseRun]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="EvalCaseRun.created_at"
    )


class EvalCaseRun(Base):
    __tablename__ = "eval_case_runs"
    __table_args__ = (Index("ix_eval_case_runs_run_status", "run_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_runs.id", ondelete="CASCADE"))
    case_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("eval_case_versions.id", ondelete="RESTRICT")
    )
    call_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("calls.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="queued")
    passed: Mapped[bool | None] = mapped_column(nullable=True)
    score: Mapped[float | None] = mapped_column(nullable=True)
    failure_summary: Mapped[str] = mapped_column(String(1000), default="")
    evidence: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped[EvalRun] = relationship(back_populates="case_runs")
    case_version: Mapped[EvalCaseVersion] = relationship(back_populates="case_runs")
    assertion_results: Mapped[list[EvalAssertionResult]] = relationship(
        back_populates="case_run", cascade="all, delete-orphan"
    )
    metric_results: Mapped[list[EvalMetricResult]] = relationship(
        back_populates="case_run", cascade="all, delete-orphan"
    )


class EvalAssertionResult(Base):
    __tablename__ = "eval_assertion_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    case_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("eval_case_runs.id", ondelete="CASCADE")
    )
    assertion_key: Mapped[str] = mapped_column(String(120))
    assertion_type: Mapped[str] = mapped_column(String(32))
    passed: Mapped[bool] = mapped_column(Boolean)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    expected: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    actual: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    explanation: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case_run: Mapped[EvalCaseRun] = relationship(back_populates="assertion_results")


class EvalMetricResult(Base):
    __tablename__ = "eval_metric_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    case_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("eval_case_runs.id", ondelete="CASCADE")
    )
    metric_key: Mapped[str] = mapped_column(String(120))
    score: Mapped[float] = mapped_column()
    weight: Mapped[float] = mapped_column(default=1.0)
    explanation: Mapped[str] = mapped_column(String(1000), default="")
    judge_metadata: Mapped[dict[str, object]] = mapped_column(json_document_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case_run: Mapped[EvalCaseRun] = relationship(back_populates="metric_results")


Index("ix_calls_tenant_created", Call.tenant_id, Call.created_at)
