from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert

from voice_backend.models import Base
from voice_backend.schema import build_engine_connect_args, configure_engine
from voice_backend.security import hash_password
from voice_migrator.config import get_settings
from voice_migrator.logging import configure_logging, get_logger


def tenant_slug_from_name(name: str) -> str:
    return name.strip().lower().replace(" ", "-")


def build_default_provider_rows(tenant_id) -> list[dict[str, object]]:
    return [
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "stt",
            "vendor_name": "mock-stt",
            "label": "Local Mock STT",
            "status": "configured",
            "config": {"mode": "local"},
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "llm",
            "vendor_name": "mock-llm",
            "label": "Local Mock LLM",
            "status": "configured",
            "config": {"mode": "local"},
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "tts",
            "vendor_name": "mock-tts",
            "label": "Local Mock TTS",
            "status": "configured",
            "config": {"mode": "local"},
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "telephony",
            "vendor_name": "mock-telephony",
            "label": "Local Mock Telephony",
            "status": "configured",
            "config": {"mode": "local"},
        },
    ]


def build_demo_connection_rows(tenant_id) -> list[dict[str, object]]:
    return [
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "crm",
            "vendor_name": "salesforce",
            "label": "Primary CRM",
            "status": "active",
            "config": {
                "name": "Primary CRM",
                "description": "CRM timeline sync for qualified leads.",
                "ui_status": "Connected",
                "detail": "Salesforce sync is healthy and ready for call outcomes.",
                "last_checked": "Healthy now",
            },
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "calendar",
            "vendor_name": "google-calendar",
            "label": "Meeting calendar",
            "status": "active",
            "config": {
                "name": "Meeting calendar",
                "description": "Calendar booking for follow-up and demo scheduling.",
                "ui_status": "Connected",
                "detail": "Google Calendar booking is configured for handoff flows.",
                "last_checked": "Healthy now",
            },
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "provider_kind": "knowledge",
            "vendor_name": "notion",
            "label": "Operating knowledge",
            "status": "active",
            "config": {
                "name": "Operating knowledge",
                "description": "Knowledge source used to ground qualification and policy answers.",
                "ui_status": "Connected",
                "detail": "Notion knowledge sync is current for agent grounding.",
                "last_checked": "Healthy now",
            },
        },
    ]


def build_demo_agents(tenant_id, workspace_id) -> list[dict[str, object]]:
    return [
        {
            "definition": {
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "agent_key": "lead-router",
                "name": "Lead router",
                "status": "published",
            },
            "version": {
                "id": uuid.uuid4(),
                "version_number": 1,
                "pipeline_mode": "stt_llm_tts",
                "routing_config": {
                    "description": "Routes qualification, booking, and escalation paths for generic lead workflows.",
                    "shared_prompt": "Stay concise, qualify clearly, and only move to the next state when intent is explicit.",
                    "segment": "Qualification",
                    "goal": "Qualify and convert high-intent leads.",
                    "flow_nodes": [
                        {
                            "id": "router",
                            "label": "Router",
                            "x": 100,
                            "y": 120,
                            "tone": "neutral",
                            "state": "Intent detection",
                            "prompt": "Classify whether the lead needs qualification, support, or escalation.",
                            "tools": [],
                            "knowledge": [],
                            "vendors": {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "ElevenLabs"},
                        },
                        {
                            "id": "qualify",
                            "label": "Qualification",
                            "x": 360,
                            "y": 80,
                            "tone": "success",
                            "state": "Fit scoring",
                            "prompt": "Capture company, need, timing, and next step.",
                            "tools": [],
                            "knowledge": [],
                            "vendors": {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "ElevenLabs"},
                        },
                        {
                            "id": "escalate",
                            "label": "Escalation",
                            "x": 360,
                            "y": 240,
                            "tone": "warning",
                            "state": "Human assist",
                            "prompt": "Escalate compliance or edge-case calls to a human operator.",
                            "tools": [],
                            "knowledge": [],
                            "vendors": {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "ElevenLabs"},
                        },
                    ],
                    "flow_edges": [
                        {
                            "id": "edge_router_qualify",
                            "source_id": "router",
                            "target_id": "qualify",
                            "label": "Needs qualification",
                            "condition": "Move here when the caller intent is clear enough to score fit and urgency.",
                        },
                        {
                            "id": "edge_router_escalate",
                            "source_id": "router",
                            "target_id": "escalate",
                            "label": "Needs human assist",
                            "condition": "Move here when the caller enters a sensitive or exception path.",
                        },
                    ],
                    "tools_catalog": [],
                    "knowledge_sources": [],
                },
                "vendor_config": {
                    "stack": {"stt": "Deepgram", "llm": "GPT-4.1", "tts": "ElevenLabs"}
                },
            },
        },
        {
            "definition": {
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "agent_key": "follow-up-concierge",
                "name": "Follow-up concierge",
                "status": "draft",
            },
            "version": {
                "id": uuid.uuid4(),
                "version_number": 1,
                "pipeline_mode": "stt_llm_tts",
                "routing_config": {
                    "description": "Handles callbacks, reminders, and post-call conversion nudges.",
                    "shared_prompt": "Stay helpful and low-pressure. Confirm what changed and move the caller toward the cleanest next committed step.",
                    "segment": "Conversion",
                    "goal": "Keep promising leads moving toward the next committed step.",
                    "flow_nodes": [
                        {
                            "id": "callback",
                            "label": "Callback",
                            "x": 100,
                            "y": 120,
                            "tone": "neutral",
                            "state": "Re-engagement",
                            "prompt": "Reconnect with interested leads and confirm the next step.",
                            "tools": [],
                            "knowledge": [],
                            "vendors": {"stt": "AssemblyAI", "llm": "Claude Sonnet", "tts": "Cartesia"},
                        },
                        {
                            "id": "book",
                            "label": "Booking",
                            "x": 360,
                            "y": 120,
                            "tone": "success",
                            "state": "Calendar conversion",
                            "prompt": "Offer and confirm a follow-up slot or meeting.",
                            "tools": [],
                            "knowledge": [],
                            "vendors": {"stt": "AssemblyAI", "llm": "Claude Sonnet", "tts": "Cartesia"},
                        },
                    ],
                    "flow_edges": [
                        {
                            "id": "edge_callback_book",
                            "source_id": "callback",
                            "target_id": "book",
                            "label": "Ready to book",
                            "condition": "Move here when the caller confirms interest and agrees to schedule the next step.",
                        }
                    ],
                    "tools_catalog": [],
                    "knowledge_sources": [],
                },
                "vendor_config": {
                    "stack": {"stt": "AssemblyAI", "llm": "Claude Sonnet", "tts": "Cartesia"}
                },
            },
        },
    ]


def build_demo_calls(tenant_id, workspace_id, agent_definition_rows) -> list[dict[str, object]]:
    now = datetime.now(UTC)
    lead_router_version_id = agent_definition_rows[0]["version"]["id"]
    concierge_version_id = agent_definition_rows[1]["version"]["id"]
    return [
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "workspace_id": workspace_id,
            "agent_version_id": lead_router_version_id,
            "direction": "outbound",
            "status": "completed",
            "from_number": "+14155550001",
            "to_number": "+14155550188",
            "started_at": now - timedelta(minutes=18),
            "ended_at": now - timedelta(minutes=15),
            "created_at": now - timedelta(minutes=18),
            "resolved_config": {
                "agent_name": "Lead router",
                "lead_name": "Maya Patel",
                "company": "Northstar Clinics",
                "phone": "+1 415 555 0188",
                "scenario_name": "Lead qualification",
                "status_label": "Completed",
                "duration": "03:14",
                "time": "12 minutes ago",
                "summary": "Captured timing, budget, and product fit. Lead accepted a follow-up meeting.",
                "outcome": "Meeting booked",
                "next_step": "Share booking summary with the account owner.",
                "vendor_trace": "Deepgram -> GPT-4.1 -> ElevenLabs",
                "synced_to_crm": False,
                "extracted_variables": [
                    {"key": "intent", "value": "Qualified"},
                    {"key": "timeline", "value": "This month"},
                ],
                "tool_calls": [
                    {"name": "CRM lookup", "result": "Matched existing account owner and activity."},
                    {"name": "Calendar booking", "result": "Reserved a 30-minute discovery slot."},
                ],
                "guardrails": ["PII confirmation", "Escalation path available"],
                "transcript": [
                    {"speaker": "Lead", "timestamp": "00:12", "text": "We're evaluating vendors this month."},
                    {"speaker": "Voice", "timestamp": "00:25", "text": "I can help qualify the fit and book the next step."},
                ],
            },
        },
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "workspace_id": workspace_id,
            "agent_version_id": concierge_version_id,
            "direction": "outbound",
            "status": "completed",
            "from_number": "+14155550002",
            "to_number": "+14155550121",
            "started_at": now - timedelta(hours=2),
            "ended_at": now - timedelta(hours=2, minutes=-2),
            "created_at": now - timedelta(hours=2),
            "resolved_config": {
                "agent_name": "Follow-up concierge",
                "lead_name": "Jordan Lee",
                "company": "Summit Solar",
                "phone": "+1 415 555 0121",
                "scenario_name": "Follow-up conversion",
                "status_label": "Follow-up",
                "duration": "02:08",
                "time": "2 hours ago",
                "summary": "Lead requested a callback after internal review. Owner follow-up was queued.",
                "outcome": "Follow-up needed",
                "next_step": "Owner to call back on Tuesday afternoon.",
                "vendor_trace": "AssemblyAI -> Claude Sonnet -> Cartesia",
                "synced_to_crm": True,
                "extracted_variables": [
                    {"key": "intent", "value": "Interested"},
                    {"key": "blocker", "value": "Needs stakeholder review"},
                ],
                "tool_calls": [
                    {"name": "CRM lookup", "result": "Updated deal note and scheduled owner callback."}
                ],
                "guardrails": ["No pricing promises", "Logged callback request"],
                "transcript": [
                    {"speaker": "Lead", "timestamp": "00:09", "text": "We need one more internal review before committing."},
                    {"speaker": "Voice", "timestamp": "00:31", "text": "I'll log that and set up the next callback window."},
                ],
            },
        },
    ]


def main() -> None:
    configure_logging()
    logger = get_logger(__name__)
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        future=True,
        connect_args=build_engine_connect_args(settings.database_url),
    )
    configure_engine(engine, settings.database_url)

    users_table = Base.metadata.tables["users"]
    tenants_table = Base.metadata.tables["tenants"]
    workspaces_table = Base.metadata.tables["workspaces"]
    memberships_table = Base.metadata.tables["tenant_memberships"]
    provider_accounts_table = Base.metadata.tables["provider_accounts"]
    agent_definitions_table = Base.metadata.tables["agent_definitions"]
    agent_versions_table = Base.metadata.tables["agent_versions"]
    calls_table = Base.metadata.tables["calls"]

    tenant_slug = tenant_slug_from_name(settings.tenant_name)

    with engine.begin() as connection:
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        connection.execute(
            insert(users_table)
            .values(
                id=user_id,
                email=settings.admin_email,
                display_name=settings.admin_name,
                password_hash=hash_password(
                    settings.admin_password,
                    iterations=settings.password_hash_iterations,
                ),
                is_platform_admin=True,
            )
            .on_conflict_do_update(
                index_elements=["email"],
                set_={
                    "display_name": settings.admin_name,
                    "password_hash": hash_password(
                        settings.admin_password,
                        iterations=settings.password_hash_iterations,
                    ),
                    "is_platform_admin": True,
                },
            )
        )

        connection.execute(
            insert(tenants_table)
            .values(
                id=tenant_id,
                slug=tenant_slug,
                name=settings.tenant_name,
                status="active",
            )
            .on_conflict_do_update(
                index_elements=["slug"],
                set_={"name": settings.tenant_name, "status": "active"},
            )
        )

        tenant_row = connection.execute(
            select(tenants_table.c.id).where(tenants_table.c.slug == tenant_slug)
        ).one()
        tenant_id = tenant_row.id

        connection.execute(
            insert(workspaces_table)
            .values(
                id=workspace_id,
                tenant_id=tenant_id,
                name=settings.workspace_name,
                is_default=True,
            )
            .on_conflict_do_nothing(index_elements=["tenant_id", "name"])
        )

        workspace_row = connection.execute(
            select(workspaces_table.c.id)
            .where(workspaces_table.c.tenant_id == tenant_id)
            .where(workspaces_table.c.name == settings.workspace_name)
        ).one()
        workspace_id = workspace_row.id

        user_row = connection.execute(
            select(users_table.c.id).where(users_table.c.email == settings.admin_email)
        ).one()
        user_id = user_row.id

        connection.execute(
            insert(memberships_table)
            .values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                user_id=user_id,
                role="admin",
            )
            .on_conflict_do_nothing(index_elements=["tenant_id", "workspace_id", "user_id"])
        )

        if settings.seed_mode == "demo":
            default_provider_rows = build_default_provider_rows(tenant_id)

            for row in default_provider_rows:
                connection.execute(
                    insert(provider_accounts_table)
                    .values(**row)
                    .on_conflict_do_nothing(
                        index_elements=["tenant_id", "provider_kind", "label"]
                    )
                )

            for row in build_demo_connection_rows(tenant_id):
                connection.execute(
                    insert(provider_accounts_table)
                    .values(**row)
                    .on_conflict_do_update(
                        index_elements=["tenant_id", "provider_kind", "label"],
                        set_={
                            "vendor_name": row["vendor_name"],
                            "status": row["status"],
                            "config": row["config"],
                        },
                    )
                )

            if not connection.execute(
                select(calls_table.c.id).where(calls_table.c.workspace_id == workspace_id).limit(1)
            ).first():
                demo_agents = build_demo_agents(tenant_id, workspace_id)
                seeded_demo_agents: list[dict[str, object]] = []
                for agent in demo_agents:
                    definition = agent["definition"]
                    version = agent["version"]
                    connection.execute(
                        insert(agent_definitions_table)
                        .values(**definition)
                        .on_conflict_do_update(
                            index_elements=["tenant_id", "workspace_id", "agent_key"],
                            set_={
                                "name": definition["name"],
                                "status": definition["status"],
                            },
                        )
                    )
                    agent_row = connection.execute(
                        select(agent_definitions_table.c.id).where(
                            agent_definitions_table.c.tenant_id == tenant_id,
                            agent_definitions_table.c.workspace_id == workspace_id,
                            agent_definitions_table.c.agent_key == definition["agent_key"],
                        )
                    ).one()
                    version_payload = {
                        **version,
                        "agent_definition_id": agent_row.id,
                    }
                    connection.execute(
                        insert(agent_versions_table)
                        .values(**version_payload)
                        .on_conflict_do_nothing(
                            index_elements=["agent_definition_id", "version_number"]
                        )
                    )

                    actual_version = connection.execute(
                        select(agent_versions_table.c.id).where(
                            agent_versions_table.c.agent_definition_id == agent_row.id,
                            agent_versions_table.c.version_number == version["version_number"],
                        )
                    ).one()
                    seeded_demo_agents.append(
                        {
                            **agent,
                            "definition": {**definition, "id": agent_row.id},
                            "version": {**version, "id": actual_version.id},
                        }
                    )

                for call in build_demo_calls(tenant_id, workspace_id, seeded_demo_agents):
                    connection.execute(insert(calls_table).values(**call))

    logger.info(
        "seed.completed",
        admin_email=settings.admin_email,
        tenant_name=settings.tenant_name,
        workspace_name=settings.workspace_name,
        seed_mode=settings.seed_mode,
    )
