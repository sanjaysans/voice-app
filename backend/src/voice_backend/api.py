from collections.abc import Callable
from typing import Annotated, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from voice_backend.database import get_request_session
from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionUpdateInput,
    AgentStudioUpdateInput,
    AgentVersionCreateInput,
    CallReviewCreateInput,
    CallReviewUpdateInput,
    ProviderAccountCreateInput,
    ProviderAccountUpdateInput,
    TeamMemberCreateInput,
    TeamMemberUpdateInput,
    TenantCreateInput,
    TenantUpdateInput,
    WorkspaceCreateInput,
    WorkspaceUpdateInput,
)
from voice_backend.services import (
    AgentCatalogService,
    AgentDefinitionAdminService,
    CallHistoryService,
    CallReviewService,
    ProviderAccountAdminService,
    TeamAdminService,
    TenantAdminService,
    TenantOverviewService,
    WorkspaceAdminService,
    WorkspaceStateService,
)

router = APIRouter(prefix="/api/v1")
SessionDependency = Annotated[Session, Depends(get_request_session)]
MutationResult = TypeVar("MutationResult")


def _execute_write(session: Session, operation: Callable[[], MutationResult]) -> MutationResult:
    try:
        result = operation()
        session.commit()
        return result
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="resource conflict") from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(status_code=500, detail="database operation failed") from exc


@router.get("/tenants")
def list_tenants(session: SessionDependency):
    return [item.model_dump() for item in TenantAdminService(session).list_tenants()]


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreateInput, session: SessionDependency):
    created = _execute_write(session, lambda: TenantAdminService(session).create_tenant(payload))
    return created.model_dump()


@router.get("/tenants/{tenant_slug}")
def get_tenant(tenant_slug: str, session: SessionDependency):
    tenant = TenantAdminService(session).get_tenant(tenant_slug)
    if tenant is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return tenant.model_dump()


@router.patch("/tenants/{tenant_slug}")
def update_tenant(tenant_slug: str, payload: TenantUpdateInput, session: SessionDependency):
    updated = _execute_write(
        session, lambda: TenantAdminService(session).update_tenant(tenant_slug, payload)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return updated.model_dump()


@router.delete("/tenants/{tenant_slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(tenant_slug: str, session: SessionDependency) -> Response:
    deleted = _execute_write(
        session, lambda: TenantAdminService(session).delete_tenant(tenant_slug)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="tenant not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/overview")
def get_tenant_overview(tenant_slug: str, session: SessionDependency):
    overview = TenantOverviewService(session).get_by_slug(tenant_slug)
    if overview is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return overview.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces")
def list_workspaces(tenant_slug: str, session: SessionDependency):
    workspaces = WorkspaceAdminService(session).list_workspaces(tenant_slug)
    if workspaces is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return [item.model_dump() for item in workspaces]


@router.post("/tenants/{tenant_slug}/workspaces", status_code=status.HTTP_201_CREATED)
def create_workspace(tenant_slug: str, payload: WorkspaceCreateInput, session: SessionDependency):
    created = _execute_write(
        session,
        lambda: WorkspaceAdminService(session).create_workspace(tenant_slug, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}")
def get_workspace(tenant_slug: str, workspace_id: UUID, session: SessionDependency):
    workspace = WorkspaceAdminService(session).get_workspace(tenant_slug, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return workspace.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/app-state")
def get_workspace_app_state(tenant_slug: str, workspace_id: UUID, session: SessionDependency):
    state = WorkspaceStateService(session).get_state(tenant_slug, workspace_id)
    if state is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return state.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}")
def update_workspace(
    tenant_slug: str,
    workspace_id: UUID,
    payload: WorkspaceUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: WorkspaceAdminService(session).update_workspace(tenant_slug, workspace_id, payload),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_workspace(tenant_slug: str, workspace_id: UUID, session: SessionDependency) -> Response:
    deleted = _execute_write(
        session,
        lambda: WorkspaceAdminService(session).delete_workspace(tenant_slug, workspace_id),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="workspace not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/members")
def list_team_members(tenant_slug: str, workspace_id: UUID, session: SessionDependency):
    members = TeamAdminService(session).list_members(tenant_slug, workspace_id)
    if members is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in members]


@router.post("/tenants/{tenant_slug}/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
def create_team_member(
    tenant_slug: str,
    workspace_id: UUID,
    payload: TeamMemberCreateInput,
    session: SessionDependency,
):
    created = _execute_write(
        session,
        lambda: TeamAdminService(session).create_member(tenant_slug, workspace_id, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return created.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/members/{membership_id}")
def update_team_member(
    tenant_slug: str,
    workspace_id: UUID,
    membership_id: UUID,
    payload: TeamMemberUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: TeamAdminService(session).update_member(
            tenant_slug, workspace_id, membership_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="team member not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_team_member(
    tenant_slug: str,
    workspace_id: UUID,
    membership_id: UUID,
    session: SessionDependency,
) -> Response:
    deleted = _execute_write(
        session,
        lambda: TeamAdminService(session).delete_member(
            tenant_slug, workspace_id, membership_id
        ),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="team member not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents")
def list_workspace_agents(tenant_slug: str, workspace_id: UUID, session: SessionDependency):
    summaries = AgentCatalogService(session).list_workspace_agents(tenant_slug, workspace_id)
    if summaries is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in summaries]


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/agents", status_code=status.HTTP_201_CREATED
)
def create_workspace_agent(
    tenant_slug: str,
    workspace_id: UUID,
    payload: AgentDefinitionCreateInput,
    session: SessionDependency,
):
    created = _execute_write(
        session,
        lambda: AgentDefinitionAdminService(session).create_agent(
            tenant_slug, workspace_id, payload
        ),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}")
def get_workspace_agent(
    tenant_slug: str, workspace_id: UUID, agent_id: UUID, session: SessionDependency
):
    agent = AgentDefinitionAdminService(session).get_agent(tenant_slug, workspace_id, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return agent.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}")
def update_workspace_agent(
    tenant_slug: str,
    workspace_id: UUID,
    agent_id: UUID,
    payload: AgentDefinitionUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: AgentDefinitionAdminService(session).update_agent(
            tenant_slug, workspace_id, agent_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return updated.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}/studio")
def update_workspace_agent_studio(
    tenant_slug: str,
    workspace_id: UUID,
    agent_id: UUID,
    payload: AgentStudioUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: AgentDefinitionAdminService(session).update_studio(
            tenant_slug, workspace_id, agent_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return updated.model_dump()


@router.post("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}/versions")
def create_workspace_agent_version(
    tenant_slug: str,
    workspace_id: UUID,
    agent_id: UUID,
    payload: AgentVersionCreateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: AgentDefinitionAdminService(session).create_version(
            tenant_slug, workspace_id, agent_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_workspace_agent(
    tenant_slug: str,
    workspace_id: UUID,
    agent_id: UUID,
    session: SessionDependency,
) -> Response:
    deleted = _execute_write(
        session,
        lambda: AgentDefinitionAdminService(session).delete_agent(
            tenant_slug, workspace_id, agent_id
        ),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="agent not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/recent")
def list_recent_calls(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    limit: int = Query(default=20, ge=1, le=100),
):
    summaries = CallHistoryService(session).list_recent_calls(
        tenant_slug, workspace_id, limit=limit
    )
    if summaries is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in summaries]


@router.post("/tenants/{tenant_slug}/workspaces/{workspace_id}/calls", status_code=status.HTTP_201_CREATED)
def create_call_review(
    tenant_slug: str,
    workspace_id: UUID,
    payload: CallReviewCreateInput,
    session: SessionDependency,
):
    created = _execute_write(
        session,
        lambda: CallReviewService(session).create_review(tenant_slug, workspace_id, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="call dependencies not found")
    return created.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/{call_id}")
def update_call_review(
    tenant_slug: str,
    workspace_id: UUID,
    call_id: UUID,
    payload: CallReviewUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: CallReviewService(session).update_review(tenant_slug, workspace_id, call_id, payload),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="call not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/{call_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_call_review(
    tenant_slug: str,
    workspace_id: UUID,
    call_id: UUID,
    session: SessionDependency,
) -> Response:
    deleted = _execute_write(
        session,
        lambda: CallReviewService(session).delete_review(tenant_slug, workspace_id, call_id),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="call not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/provider-accounts")
def list_provider_accounts(tenant_slug: str, session: SessionDependency):
    accounts = ProviderAccountAdminService(session).list_accounts(tenant_slug)
    if accounts is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return [item.model_dump() for item in accounts]


@router.post("/tenants/{tenant_slug}/provider-accounts", status_code=status.HTTP_201_CREATED)
def create_provider_account(
    tenant_slug: str,
    payload: ProviderAccountCreateInput,
    session: SessionDependency,
):
    created = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).create_account(tenant_slug, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/provider-accounts/{provider_account_id}")
def get_provider_account(tenant_slug: str, provider_account_id: UUID, session: SessionDependency):
    account = ProviderAccountAdminService(session).get_account(tenant_slug, provider_account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="provider account not found")
    return account.model_dump()


@router.patch("/tenants/{tenant_slug}/provider-accounts/{provider_account_id}")
def update_provider_account(
    tenant_slug: str,
    provider_account_id: UUID,
    payload: ProviderAccountUpdateInput,
    session: SessionDependency,
):
    updated = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).update_account(
            tenant_slug, provider_account_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="provider account not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/provider-accounts/{provider_account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_provider_account(
    tenant_slug: str, provider_account_id: UUID, session: SessionDependency
) -> Response:
    deleted = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).delete_account(
            tenant_slug, provider_account_id
        ),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="provider account not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
