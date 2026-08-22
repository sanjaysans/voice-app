from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from voice_backend.database import get_request_session
from voice_backend.services import AgentCatalogService, CallHistoryService, TenantOverviewService

router = APIRouter(prefix="/api/v1")
SessionDependency = Annotated[Session, Depends(get_request_session)]


@router.get("/tenants/{tenant_slug}/overview")
def get_tenant_overview(tenant_slug: str, session: SessionDependency):
    overview = TenantOverviewService(session).get_by_slug(tenant_slug)
    if overview is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return overview.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents")
def list_workspace_agents(tenant_slug: str, workspace_id: UUID, session: SessionDependency):
    summaries = AgentCatalogService(session).list_workspace_agents(tenant_slug, workspace_id)
    if summaries is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in summaries]


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/recent")
def list_recent_calls(tenant_slug: str, workspace_id: UUID, session: SessionDependency, limit: int = 20):
    summaries = CallHistoryService(session).list_recent_calls(tenant_slug, workspace_id, limit=limit)
    if summaries is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in summaries]
