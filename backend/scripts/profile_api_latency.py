from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = ROOT / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from voice_backend import api as backend_api  # noqa: E402
from voice_backend.app import create_app  # noqa: E402
from voice_backend.database import get_request_session  # noqa: E402
from voice_backend.models import Base  # noqa: E402
from voice_backend.repositories import (  # noqa: E402
    AgentRepository,
    CallRepository,
    MembershipRepository,
    ProviderAccountRepository,
    TenantRepository,
    UserRepository,
    WorkspaceRepository,
)
from voice_backend.security import hash_password  # noqa: E402


@dataclass
class ProfileContext:
    session: Session
    seeded: dict[str, object]


@dataclass
class ProfileCase:
    method: str
    path_label: str
    prepare: Callable[[AsyncClient, ProfileContext], Awaitable[None]] | None
    execute: Callable[[AsyncClient, ProfileContext], Awaitable[object]]


PRIMARY_WORKSPACE_AGENT_COUNT = int(os.getenv("VOICE_PROFILE_AGENT_COUNT", "120"))
SECONDARY_WORKSPACE_AGENT_COUNT = int(os.getenv("VOICE_PROFILE_SECONDARY_AGENT_COUNT", "36"))
PRIMARY_WORKSPACE_MEMBER_COUNT = int(os.getenv("VOICE_PROFILE_MEMBER_COUNT", "80"))
PRIMARY_WORKSPACE_CALL_COUNT = int(os.getenv("VOICE_PROFILE_CALL_COUNT", "1400"))
SECONDARY_WORKSPACE_CALL_COUNT = int(os.getenv("VOICE_PROFILE_SECONDARY_CALL_COUNT", "220"))
PROVIDER_ACCOUNT_COUNT = int(os.getenv("VOICE_PROFILE_PROVIDER_ACCOUNT_COUNT", "24"))
PROFILE_ITERATIONS = int(os.getenv("VOICE_PROFILE_ITERATIONS", "3"))


def create_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return factory()


def build_session_override(session: Session) -> Callable[[], Session]:
    def _override() -> Session:
        return session

    return _override


def seed_domain(session: Session) -> dict[str, object]:
    tenants = TenantRepository(session)
    workspaces = WorkspaceRepository(session)
    agents = AgentRepository(session)
    calls = CallRepository(session)
    memberships = MembershipRepository(session)
    provider_accounts = ProviderAccountRepository(session)
    users = UserRepository(session)

    tenant = tenants.create(slug="voice-demo", name="Voice Demo")
    workspaces.create(tenants.create(slug="other-tenant", name="Other Tenant").id, "Foreign", is_default=True)
    workspace = workspaces.create(tenant.id, "Sales", is_default=True)
    secondary_workspace = workspaces.create(tenant.id, "Support", is_default=False)
    user = users.create(
        "admin@voice.local",
        "Voice Admin",
        password_hash=hash_password("voice-demo-password", iterations=1_000),
        is_platform_admin=True,
    )
    membership = memberships.create(tenant.id, workspace.id, user.id, "admin")
    agent = agents.create_definition(
        tenant.id, workspace.id, "lead-router", "Lead Router", status="published"
    )
    old_version = agents.create_version(agent.id, 1, "stt_llm_tts")
    latest_version = agents.create_version(agent.id, 2, "realtime_s2s")
    provider_account = provider_accounts.create(
        tenant.id,
        "stt",
        "deepgram",
        "Primary STT",
        status="active",
        config={"api_key_ref": "secret://deepgram/primary"},
    )

    primary_versions = [old_version, latest_version]

    extra_primary_agents = []
    for index in range(PRIMARY_WORKSPACE_AGENT_COUNT - 1):
        extra_agent = agents.create_definition(
            tenant.id,
            workspace.id,
            f"workflow-{index + 1}",
            f"Workflow {index + 1:03d}",
            status="published" if index % 3 else "draft",
        )
        extra_primary_agents.append(extra_agent)
        agents.create_version(
            extra_agent.id,
            1,
            "stt_llm_tts",
            routing_config=build_routing_config(index),
            vendor_config=build_vendor_config(index),
        )
        primary_versions.append(
            agents.create_version(
                extra_agent.id,
                2,
                "stt_llm_tts" if index % 5 else "realtime_s2s",
                routing_config=build_routing_config(index + 1000),
                vendor_config=build_vendor_config(index + 1000),
            )
        )

    secondary_versions = []
    for index in range(SECONDARY_WORKSPACE_AGENT_COUNT):
        support_agent = agents.create_definition(
            tenant.id,
            secondary_workspace.id,
            f"support-{index + 1}",
            f"Support {index + 1:03d}",
            status="draft" if index % 4 else "published",
        )
        secondary_versions.append(
            agents.create_version(
                support_agent.id,
                1,
                "stt_llm_tts",
                routing_config=build_routing_config(index + 2000),
                vendor_config=build_vendor_config(index + 2000),
            )
        )

    member_ids = [membership.id]
    for index in range(PRIMARY_WORKSPACE_MEMBER_COUNT):
        member_user = users.create(
            f"member-{index + 1}@voice.local",
            f"Member {index + 1:03d}",
            password_hash=hash_password("voice-demo-password", iterations=1_000),
            is_platform_admin=False,
        )
        role = "viewer" if index % 3 == 0 else "editor"
        member_ids.append(memberships.create(tenant.id, workspace.id, member_user.id, role).id)

    vendor_defs = [
        ("stt", "deepgram"),
        ("llm", "openai"),
        ("tts", "cartesia"),
        ("telephony", "twilio"),
        ("crm", "hubspot"),
        ("calendar", "google"),
        ("knowledge", "notion"),
        ("webhook", "generic"),
    ]
    provider_ids = [provider_account.id]
    for index in range(PROVIDER_ACCOUNT_COUNT - 1):
        provider_kind, vendor_name = vendor_defs[index % len(vendor_defs)]
        provider_ids.append(
            provider_accounts.create(
                tenant.id,
                provider_kind,
                vendor_name,
                f"{vendor_name.title()} {index + 1:02d}",
                status="active" if index % 4 else "draft",
                config=build_provider_config(provider_kind, vendor_name, index),
            ).id
        )

    first_call = calls.create(
        tenant.id,
        workspace.id,
        direction="outbound",
        status="completed",
        agent_version_id=old_version.id,
        from_number="+15550001",
        to_number="+15550101",
        resolved_config=build_call_payload(call_index=1, label="Baseline completed call"),
    )
    second_call = calls.create(
        tenant.id,
        workspace.id,
        direction="outbound",
        status="in_progress",
        agent_version_id=latest_version.id,
        from_number="+15550002",
        to_number="+15550102",
        resolved_config=build_call_payload(call_index=2, label="Baseline active call"),
    )

    for index in range(PRIMARY_WORKSPACE_CALL_COUNT - 2):
        version = primary_versions[index % len(primary_versions)]
        is_test = index % 7 == 0
        call = calls.create(
            tenant.id,
            workspace.id,
            direction="test" if is_test else ("inbound" if index % 4 == 0 else "outbound"),
            status="completed" if index % 5 else "in_progress",
            is_test=is_test,
            agent_version_id=version.id,
            from_number=f"+1555{700000 + index:06d}",
            to_number=f"+1555{800000 + index:06d}",
            resolved_config=build_call_payload(
                call_index=index + 3,
                label=f"Primary workload call {index + 3}",
                is_test=is_test,
            ),
        )
        call.created_at = datetime.now(UTC) - timedelta(minutes=index + 1)
        if call.status == "completed":
            call.started_at = call.created_at
            call.ended_at = call.created_at + timedelta(minutes=(index % 9) + 1)

    for index in range(SECONDARY_WORKSPACE_CALL_COUNT):
        version = secondary_versions[index % len(secondary_versions)]
        call = calls.create(
            tenant.id,
            secondary_workspace.id,
            direction="inbound" if index % 2 == 0 else "outbound",
            status="completed" if index % 6 else "queued",
            is_test=False,
            agent_version_id=version.id,
            from_number=f"+1666{700000 + index:06d}",
            to_number=f"+1666{800000 + index:06d}",
            resolved_config=build_call_payload(
                call_index=index + 5000,
                label=f"Secondary workload call {index + 1}",
                include_guardrails=index % 11 == 0,
            ),
        )
        call.created_at = datetime.now(UTC) - timedelta(hours=2, minutes=index + 1)

    now = datetime.now(UTC)
    first_call.created_at = now - timedelta(minutes=10)
    second_call.created_at = now
    second_call.started_at = now - timedelta(minutes=2)
    session.commit()

    return {
        "tenant": tenant,
        "workspace": workspace,
        "secondary_workspace": secondary_workspace,
        "membership": membership,
        "user": user,
        "agent": agent,
        "provider_account": provider_account,
        "provider_account_ids": provider_ids,
        "old_version": old_version,
        "latest_version": latest_version,
        "first_call": first_call,
        "second_call": second_call,
        "seed_summary": {
            "workspaces": 2,
            "memberships": len(member_ids),
            "primary_agents": PRIMARY_WORKSPACE_AGENT_COUNT,
            "secondary_agents": SECONDARY_WORKSPACE_AGENT_COUNT,
            "provider_accounts": len(provider_ids),
            "primary_calls": PRIMARY_WORKSPACE_CALL_COUNT,
            "secondary_calls": SECONDARY_WORKSPACE_CALL_COUNT,
        },
    }


def build_routing_config(seed: int) -> dict[str, object]:
    return {
        "description": f"High-volume workflow profile {seed}",
        "shared_prompt": (
            "Handle qualification, scheduling, support escalation, and confirmation cleanly "
            "while keeping responses concise and action-oriented."
        ),
        "segment": "lead qualification",
        "goal": "Qualify, route, and convert the caller to the right next step.",
        "flow_nodes": [
            {
                "id": f"entry-{seed}",
                "label": "Entry state",
                "x": 80,
                "y": 80,
                "tone": "neutral",
                "state": "entry",
                "prompt": "Open the conversation and collect intent.",
                "tools": [],
                "knowledge": [],
                "vendors": {"stt": "Deepgram", "llm": "OpenAI", "tts": "Cartesia"},
            },
            {
                "id": f"qualify-{seed}",
                "label": "Qualification",
                "x": 340,
                "y": 180,
                "tone": "success",
                "state": "qualification",
                "prompt": "Score urgency, fit, geography, and buyer readiness.",
                "tools": [],
                "knowledge": [],
                "vendors": {"stt": "Deepgram", "llm": "OpenAI", "tts": "Cartesia"},
            },
            {
                "id": f"handoff-{seed}",
                "label": "Escalation",
                "x": 600,
                "y": 280,
                "tone": "warning",
                "state": "handoff",
                "prompt": "Escalate if confidence drops or policy requires a human.",
                "tools": [],
                "knowledge": [],
                "vendors": {"stt": "Deepgram", "llm": "OpenAI", "tts": "Cartesia"},
            },
        ],
        "flow_edges": [
            {
                "id": f"entry-qualify-{seed}",
                "source_id": f"entry-{seed}",
                "target_id": f"qualify-{seed}",
                "label": "Intent captured",
                "condition": "intent_is_clear",
            },
            {
                "id": f"qualify-handoff-{seed}",
                "source_id": f"qualify-{seed}",
                "target_id": f"handoff-{seed}",
                "label": "Needs human",
                "condition": "confidence_below_threshold",
            },
        ],
    }


def build_vendor_config(seed: int) -> dict[str, object]:
    return {
        "stack": {"stt": "Deepgram", "llm": "OpenAI", "tts": "Cartesia"},
        "runtime_profile": {
            "telephony": {"provider": "twilio", "phone_number": f"+1555{900000 + seed % 1000:06d}"},
            "stt": {
                "provider": "deepgram",
                "model": "nova-3-general",
                "keywords": ["lead", "pricing", "follow-up", "slot booking", "handoff"],
                "keyterms": ["mandi", "harvest", "conversion", "escalation"],
            },
            "llm": {
                "provider": "openai",
                "model": "gpt-4.1-mini",
                "temperature": 0.2 + (seed % 3) * 0.1,
                "top_p": 0.9,
                "max_retries": 2,
            },
            "tts": {
                "provider": "cartesia",
                "model": "sonic-3",
                "voice": "alloy",
                "emotion": "empathetic" if seed % 2 else "neutral",
                "sample_rate": 24000,
            },
        },
    }


def build_provider_config(provider_kind: str, vendor_name: str, seed: int) -> dict[str, object]:
    base = {
        "name": f"{vendor_name.title()} profile {seed + 1}",
        "description": f"{vendor_name.title()} configuration profile {seed + 1}",
        "ui_status": "Connected" if seed % 4 else "Needs setup",
        "detail": "Provisioned for stress-profile benchmarking.",
        "last_checked": "2026-08-23 12:00 UTC",
    }
    if provider_kind == "stt":
        return base | {"api_key_ref": f"secret://deepgram/{seed}", "default_model": "nova-3-general"}
    if provider_kind == "llm":
        return base | {"api_key_ref": f"secret://openai/{seed}", "default_model": "gpt-4.1-mini"}
    if provider_kind == "tts":
        return base | {"api_key_ref": f"secret://cartesia/{seed}", "default_voice_id": "alloy"}
    if provider_kind == "telephony":
        return base | {
            "account_sid": f"AC{seed:08d}",
            "auth_token_ref": f"secret://twilio/{seed}",
            "phone_numbers": f"+1555{seed:06d}",
        }
    if provider_kind == "crm":
        return base | {"url": "https://crm.local/ingest"}
    if provider_kind == "calendar":
        return base | {"region": "asia-south-1"}
    if provider_kind == "knowledge":
        return base | {"deliveries": 4}
    return base | {"events": ["call.completed", "call.failed"]}


def build_call_payload(
    *,
    call_index: int,
    label: str,
    is_test: bool = False,
    include_guardrails: bool = False,
) -> dict[str, object]:
    transcript = [
        {
            "speaker": "Agent" if turn_index % 2 == 0 else "Lead",
            "timestamp": f"00:{turn_index:02d}",
            "text": (
                f"{label} turn {turn_index}. We are validating routing, qualification, "
                f"outcome capture, and follow-up behavior across a realistic transcript."
            ),
        }
        for turn_index in range(12)
    ]
    return {
        "agent_name": f"Workflow {call_index % PRIMARY_WORKSPACE_AGENT_COUNT:03d}",
        "lead_name": f"Lead {call_index:05d}",
        "company": f"Company {call_index:05d}",
        "phone": f"+1555{call_index:06d}",
        "scenario_name": "Browser live test" if is_test else "Qualification workflow",
        "status_label": "Completed" if call_index % 5 else "Follow-up",
        "duration": f"{(call_index % 8) + 1:02d}:{(call_index * 7) % 60:02d}",
        "time": "Today",
        "summary": f"{label} completed with captured outcome and follow-up detail.",
        "outcome": "Qualified" if call_index % 4 else "Follow up required",
        "next_step": "Review transcript and sync to CRM." if is_test else "Move to next sales action.",
        "vendor_trace": "Deepgram -> OpenAI -> Cartesia",
        "synced_to_crm": call_index % 3 == 0,
        "extracted_variables": [
            {"key": "language", "value": "English"},
            {"key": "intent", "value": "Lead qualification"},
            {"key": "urgency", "value": "High" if call_index % 4 == 0 else "Normal"},
        ],
        "tool_calls": [
            {"name": "calendar.lookup", "result": "Slots available next week"},
            {"name": "crm.upsert", "result": "Lead synced to CRM staging"},
        ],
        "guardrails": ["Needs policy review"] if include_guardrails else [],
        "transcript": transcript,
    }


async def login(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@voice.local", "password": "voice-demo-password"},
    )
    if response.status_code != 200:
        raise RuntimeError(f"login failed: {response.status_code} {response.text}")


async def prepare_auth(client: AsyncClient, _: ProfileContext) -> None:
    await login(client)


async def prepare_call_logs(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    second_call = ctx.seeded["second_call"]
    second_call.is_test = True
    second_call.resolved_config = {
        "agent_name": "Lead Router",
        "lead_name": "Test Caller",
        "company": "Vegrow",
        "phone": "+15550102",
        "scenario_name": "Browser live test",
        "status_label": "Completed",
        "duration": "00:42",
        "time": "Today",
        "summary": "Completed browser validation run.",
        "outcome": "Completed",
        "next_step": "Review transcript.",
        "vendor_trace": "Deepgram -> OpenAI -> Cartesia",
        "synced_to_crm": False,
        "extracted_variables": [],
        "tool_calls": [],
        "guardrails": [],
        "transcript": [],
    }
    ctx.session.commit()


async def prepare_member_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    users = UserRepository(ctx.session)
    memberships = MembershipRepository(ctx.session)
    workspace = ctx.seeded["workspace"]
    tenant = ctx.seeded["tenant"]
    member_user = users.create(
        "ops-profile@example.com",
        "Ops Profile",
        password_hash=hash_password("ops-password", iterations=1_000),
        is_platform_admin=False,
    )
    membership = memberships.create(tenant.id, workspace.id, member_user.id, "viewer")
    ctx.seeded["profile_membership"] = membership
    ctx.session.commit()


async def prepare_workspace_delete_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    workspaces = WorkspaceRepository(ctx.session)
    tenant = ctx.seeded["tenant"]
    workspace = workspaces.create(tenant.id, "Delete Me", is_default=False)
    ctx.seeded["delete_workspace"] = workspace
    ctx.session.commit()


async def prepare_agent_delete_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    agents = AgentRepository(ctx.session)
    tenant = ctx.seeded["tenant"]
    workspace = ctx.seeded["workspace"]
    agent = agents.create_definition(tenant.id, workspace.id, "delete-router", "Delete Router", status="draft")
    ctx.seeded["delete_agent"] = agent
    ctx.session.commit()


async def prepare_live_session_update_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    with patch.object(backend_api, "RealtimeSessionService", StubRealtimeSessionService):
        response = await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/live/sessions",
            json=live_session_payload(ctx),
        )
    if response.status_code != 201:
        raise RuntimeError(f"live session setup failed: {response.status_code} {response.text}")
    ctx.seeded["live_call_id"] = response.json()["call_id"]


async def prepare_call_update_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    response = await client.post(
        f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls",
        json=call_review_payload(ctx),
    )
    if response.status_code != 201:
        raise RuntimeError(f"call setup failed: {response.status_code} {response.text}")
    ctx.seeded["profile_call_id"] = response.json()["call_id"]


async def prepare_provider_target(client: AsyncClient, ctx: ProfileContext) -> None:
    await login(client)
    response = await client.post(
        "/api/v1/tenants/voice-demo/provider-accounts",
        json={
            "provider_kind": "llm",
            "vendor_name": "openai",
            "label": "OpenAI Profile",
            "status": "draft",
            "config": {"api_key": "sk-profile"},
        },
    )
    if response.status_code != 201:
        raise RuntimeError(
            f"provider setup failed: {response.status_code} {response.text}"
        )
    ctx.seeded["profile_provider_account_id"] = response.json()["provider_account_id"]


def live_session_payload(ctx: ProfileContext) -> dict[str, object]:
    return {
        "agent_id": str(ctx.seeded["agent"].id),
        "dispatch_agent_name": "voice-router-agent",
        "stt": {"api_key": "dg-key"},
        "llm": {"api_key": "oa-key"},
        "tts": {"api_key": "ca-key"},
    }


def call_review_payload(ctx: ProfileContext) -> dict[str, object]:
    return {
        "agent_id": str(ctx.seeded["agent"].id),
        "lead_name": "Morgan Hart",
        "company": "Signal Labs",
        "phone": "+15551230000",
        "scenario_name": "Qualification",
        "status": "Completed",
        "duration": "04:22",
        "summary": "Completed qualification and proposed next step.",
        "outcome": "Qualified",
        "next_step": "Notify account executive.",
        "vendor_trace": "Deepgram -> GPT-4.1 -> Cartesia",
        "synced_to_crm": False,
    }


class StubRealtimeSessionService:
    def __init__(self, _settings) -> None:
        pass

    async def create_browser_session(self, payload, *, user_id, display_name):
        class StubRecord:
            def __init__(self) -> None:
                self.call_id = None
                self.room_name = "voice-room-local"
                self.participant_identity = "web-demo-user"
                self.participant_name = display_name
                self.server_url = "ws://127.0.0.1:7880"
                self.access_token = "jwt-token"
                self.dispatch_id = "dispatch-123"
                self.dispatch_agent_name = payload.dispatch_agent_name
                self.session = {"room_name": "voice-room-local"}
                self.runtime = {"transport": "livekit"}
                self.warnings = []
                self.errors = []

            def model_dump(self):
                return {
                    "call_id": self.call_id,
                    "room_name": self.room_name,
                    "participant_identity": self.participant_identity,
                    "participant_name": self.participant_name,
                    "server_url": self.server_url,
                    "access_token": self.access_token,
                    "dispatch_id": self.dispatch_id,
                    "dispatch_agent_name": self.dispatch_agent_name,
                    "session": self.session,
                    "runtime": self.runtime,
                    "warnings": self.warnings,
                    "errors": self.errors,
                }

        return StubRecord()


class DummyProviderResponse:
    status_code = 200


class DummyProviderClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, *args, **kwargs):
        return DummyProviderResponse()


def build_cases() -> list[ProfileCase]:
    return [
        ProfileCase("POST", "/api/v1/auth/login", None, lambda client, _: client.post("/api/v1/auth/login", json={"email": "admin@voice.local", "password": "voice-demo-password"})),
        ProfileCase("POST", "/api/v1/auth/logout", prepare_auth, lambda client, _: client.post("/api/v1/auth/logout")),
        ProfileCase("GET", "/api/v1/auth/me", prepare_auth, lambda client, _: client.get("/api/v1/auth/me")),
        ProfileCase("GET", "/api/v1/tenants", prepare_auth, lambda client, _: client.get("/api/v1/tenants")),
        ProfileCase("POST", "/api/v1/tenants", prepare_auth, lambda client, _: client.post("/api/v1/tenants", json={"slug": "acme", "name": "Acme", "status": "active"})),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}", prepare_auth, lambda client, _: client.get("/api/v1/tenants/voice-demo")),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}", prepare_auth, lambda client, _: client.patch("/api/v1/tenants/voice-demo", json={"name": "Voice Demo Updated"})),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}", prepare_auth, lambda client, _: client.delete("/api/v1/tenants/voice-demo")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/overview", prepare_auth, lambda client, _: client.get("/api/v1/tenants/voice-demo/overview")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces", prepare_auth, lambda client, _: client.get("/api/v1/tenants/voice-demo/workspaces")),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces", prepare_auth, lambda client, _: client.post("/api/v1/tenants/voice-demo/workspaces", json={"name": "Growth", "is_default": False})),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/app-state", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/app-state")),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}", prepare_auth, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['secondary_workspace'].id}", json={"is_default": True})),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}", prepare_workspace_delete_target, lambda client, ctx: client.delete(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['delete_workspace'].id}")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/members", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/members")),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/members", prepare_auth, lambda client, ctx: client.post(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/members", json={"email": "ops@example.com", "display_name": "Ops Lead", "role": "admin"})),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/members/{membership_id}", prepare_member_target, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/members/{ctx.seeded['profile_membership'].id}", json={"display_name": "Ops Manager", "role": "editor"})),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/members/{membership_id}", prepare_member_target, lambda client, ctx: client.delete(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/members/{ctx.seeded['profile_membership'].id}")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents")),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents", prepare_auth, lambda client, ctx: client.post(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents", json={"agent_key": "qualification-router", "name": "Qualification Router", "status": "draft", "initial_version": {"pipeline_mode": "stt_llm_tts", "routing_config": {"entry": "qualification"}, "vendor_config": {"stt": "deepgram"}}})),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents/{ctx.seeded['agent'].id}")),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}", prepare_auth, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents/{ctx.seeded['agent'].id}", json={"status": "draft"})),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}/studio", prepare_auth, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents/{ctx.seeded['agent'].id}/studio", json={"shared_prompt": "Stay concise and confirm intent."})),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}/versions", prepare_auth, lambda client, ctx: client.post(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents/{ctx.seeded['agent'].id}/versions", json={"pipeline_mode": "realtime_s2s", "routing_config": {"entry": "handoff"}, "vendor_config": {"llm": "openai-realtime"}})),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}", prepare_agent_delete_target, lambda client, ctx: client.delete(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/agents/{ctx.seeded['delete_agent'].id}")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/recent", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls/recent", params={"limit": 20})),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/logs", prepare_call_logs, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls/logs", params={"page": 1, "page_size": 10, "status": "Completed", "call_type": "test", "query": "browser"})),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/live/sessions", prepare_auth, lambda client, ctx: patched_live_session_create(client, ctx)),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/live/sessions/{call_id}", prepare_live_session_update_target, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/live/sessions/{ctx.seeded['live_call_id']}", json={"lifecycle_status": "completed", "display_status": "Completed", "summary": "Finished browser live test.", "append_events": [{"event_type": "session_completed", "message": "Profile run completed."}]})),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/calls", prepare_auth, lambda client, ctx: client.post(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls", json=call_review_payload(ctx))),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/{call_id}", prepare_call_update_target, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls/{ctx.seeded['profile_call_id']}", json={"synced_to_crm": True, "next_step": "CRM synced."})),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/{call_id}", prepare_call_update_target, lambda client, ctx: client.delete(f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/calls/{ctx.seeded['profile_call_id']}")),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/provider-accounts", prepare_auth, lambda client, _: client.get("/api/v1/tenants/voice-demo/provider-accounts")),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/provider-accounts", prepare_auth, lambda client, _: client.post("/api/v1/tenants/voice-demo/provider-accounts", json={"provider_kind": "tts", "vendor_name": "cartesia", "label": "Primary TTS", "status": "draft", "config": {"voice_id": "amber"}})),
        ProfileCase("GET", "/api/v1/tenants/{tenant_slug}/provider-accounts/{provider_account_id}", prepare_auth, lambda client, ctx: client.get(f"/api/v1/tenants/voice-demo/provider-accounts/{ctx.seeded['provider_account'].id}")),
        ProfileCase("PATCH", "/api/v1/tenants/{tenant_slug}/provider-accounts/{provider_account_id}", prepare_provider_target, lambda client, ctx: client.patch(f"/api/v1/tenants/voice-demo/provider-accounts/{ctx.seeded['profile_provider_account_id']}", json={"status": "active"})),
        ProfileCase("POST", "/api/v1/tenants/{tenant_slug}/provider-accounts/{provider_account_id}/health-check", prepare_provider_target, lambda client, ctx: patched_provider_health_check(client, ctx)),
        ProfileCase("DELETE", "/api/v1/tenants/{tenant_slug}/provider-accounts/{provider_account_id}", prepare_provider_target, lambda client, ctx: client.delete(f"/api/v1/tenants/voice-demo/provider-accounts/{ctx.seeded['profile_provider_account_id']}")),
    ]


async def patched_live_session_create(client: AsyncClient, ctx: ProfileContext):
    with patch.object(backend_api, "RealtimeSessionService", StubRealtimeSessionService):
        return await client.post(
            f"/api/v1/tenants/voice-demo/workspaces/{ctx.seeded['workspace'].id}/live/sessions",
            json=live_session_payload(ctx),
        )


async def patched_provider_health_check(client: AsyncClient, ctx: ProfileContext):
    with patch("voice_backend.services.provider_account_admin.httpx.Client", DummyProviderClient):
        return await client.post(
            f"/api/v1/tenants/voice-demo/provider-accounts/{ctx.seeded['profile_provider_account_id']}/health-check"
        )


async def measure_case(case: ProfileCase) -> tuple[str, str, float]:
    durations = []
    for _ in range(PROFILE_ITERATIONS):
        session = create_session()
        try:
            seeded = seed_domain(session)
            app = create_app()
            app.dependency_overrides[get_request_session] = build_session_override(session)
            ctx = ProfileContext(session=session, seeded=seeded)
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://testserver",
            ) as client:
                if case.prepare is not None:
                    await case.prepare(client, ctx)
                started = perf_counter()
                response = await case.execute(client, ctx)
                elapsed = perf_counter() - started
                if response.status_code >= 400:
                    raise RuntimeError(
                        f"{case.method} {case.path_label} failed: {response.status_code} {response.text}"
                    )
                durations.append(elapsed)
        finally:
            session.close()
    return case.method, case.path_label, max(durations)


async def main() -> None:
    results = []
    failures = []
    seed_session = create_session()
    try:
        seed_summary = seed_domain(seed_session)["seed_summary"]
    finally:
        seed_session.close()
    for case in build_cases():
        try:
            results.append(await measure_case(case))
        except Exception as exc:
            failures.append((case.method, case.path_label, str(exc)))

    print(
        "seed_summary,"
        f"workspaces={seed_summary['workspaces']},"
        f"memberships={seed_summary['memberships']},"
        f"primary_agents={seed_summary['primary_agents']},"
        f"secondary_agents={seed_summary['secondary_agents']},"
        f"provider_accounts={seed_summary['provider_accounts']},"
        f"primary_calls={seed_summary['primary_calls']},"
        f"secondary_calls={seed_summary['secondary_calls']},"
        f"iterations={PROFILE_ITERATIONS}"
    )
    print("method,path,seconds")
    for method, path_label, elapsed in results:
        print(f"{method},{path_label},{elapsed:.6f}")

    if failures:
        print("\nfailures:")
        for method, path_label, message in failures:
            print(f"{method} {path_label}: {message}")
        raise SystemExit(1)

    slow = [item for item in results if item[2] > 0.5]
    if slow:
        print("\nlatency_budget_failures:")
        for method, path_label, elapsed in slow:
            print(f"{method} {path_label}: {elapsed:.6f}s")
        raise SystemExit(2)


if __name__ == "__main__":
    asyncio.run(main())
