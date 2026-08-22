from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from voice_backend.models import Base
from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    ProviderAccountRepository,
    TenantRepository,
    WorkspaceRepository,
)


@pytest.fixture
def session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    with factory() as session:
        yield session


@pytest.fixture
def seeded_domain(session: Session) -> dict[str, object]:
    tenants = TenantRepository(session)
    workspaces = WorkspaceRepository(session)
    agents = AgentRepository(session)
    calls = CallRepository(session)
    provider_accounts = ProviderAccountRepository(session)

    tenant = tenants.create(slug="voice-demo", name="Voice Demo")
    foreign_tenant = tenants.create(slug="other-tenant", name="Other Tenant")
    workspace = workspaces.create(tenant.id, "Sales", is_default=True)
    secondary_workspace = workspaces.create(tenant.id, "Support", is_default=False)
    workspaces.create(foreign_tenant.id, "Foreign Sales", is_default=True)
    agent = agents.create_definition(
        tenant.id, workspace.id, "lead-router", "Lead Router", status="published"
    )
    old_version = agents.create_version(agent.id, 1, "stt_llm_tts")
    latest_version = agents.create_version(agent.id, 2, "realtime_s2s")
    support_agent = agents.create_definition(
        tenant.id, secondary_workspace.id, "support-router", "Support Router", status="draft"
    )
    provider_account = provider_accounts.create(
        tenant.id,
        "stt",
        "deepgram",
        "Primary STT",
        status="active",
        config={"api_key_ref": "secret://deepgram/primary"},
    )

    first_call = calls.create(
        tenant.id,
        workspace.id,
        direction="outbound",
        status="completed",
        agent_version_id=old_version.id,
        from_number="+15550001",
        to_number="+15550101",
    )
    second_call = calls.create(
        tenant.id,
        workspace.id,
        direction="outbound",
        status="in_progress",
        agent_version_id=latest_version.id,
        from_number="+15550002",
        to_number="+15550102",
    )
    support_call = calls.create(
        tenant.id,
        secondary_workspace.id,
        direction="inbound",
        status="queued",
        from_number="+15550003",
        to_number="+15550103",
    )

    now = datetime.now(UTC)
    first_call.created_at = now - timedelta(minutes=10)
    second_call.created_at = now
    support_call.created_at = now - timedelta(minutes=5)
    session.commit()

    return {
        "tenant": tenant,
        "foreign_tenant": foreign_tenant,
        "workspace": workspace,
        "secondary_workspace": secondary_workspace,
        "agent": agent,
        "support_agent": support_agent,
        "provider_account": provider_account,
        "old_version": old_version,
        "latest_version": latest_version,
        "first_call": first_call,
        "second_call": second_call,
        "support_call": support_call,
    }
