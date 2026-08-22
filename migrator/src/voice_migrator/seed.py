from __future__ import annotations

import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert

from voice_backend.models import Base
from voice_backend.schema import build_engine_connect_args, configure_engine
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
                is_platform_admin=True,
            )
            .on_conflict_do_update(
                index_elements=["email"],
                set_={"display_name": settings.admin_name, "is_platform_admin": True},
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

        default_provider_rows = build_default_provider_rows(tenant_id)

        for row in default_provider_rows:
            connection.execute(
                insert(provider_accounts_table)
                .values(**row)
                .on_conflict_do_nothing(index_elements=["tenant_id", "provider_kind", "label"])
            )

    logger.info(
        "seed.completed",
        admin_email=settings.admin_email,
        tenant_name=settings.tenant_name,
        workspace_name=settings.workspace_name,
    )
