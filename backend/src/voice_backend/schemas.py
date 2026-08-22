from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TenantOverview(BaseModel):
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    workspace_count: int
    agent_count: int
    active_call_count: int
    total_call_count: int


class AgentSummary(BaseModel):
    agent_id: UUID
    workspace_id: UUID
    agent_key: str
    name: str
    status: str
    latest_version_number: int | None
    latest_pipeline_mode: str | None


class CallSummary(BaseModel):
    call_id: UUID
    workspace_id: UUID
    agent_name: str | None
    direction: str
    status: str
    from_number: str | None
    to_number: str | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
