import asyncio
from collections.abc import Callable
from pathlib import Path
from time import perf_counter
from typing import Annotated, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from voice_backend.auth import (
    AuthContext,
    get_current_auth,
    require_platform_admin,
    require_tenant_access,
    require_tenant_write_access,
    require_workspace_access,
    require_workspace_admin_access,
    require_workspace_write_access,
)
from voice_backend.database import create_session_factory, get_request_session
from voice_backend.logging import get_logger
from voice_backend.repositories import CallRepository
from voice_backend.schemas import (
    AgentDefinitionCreateInput,
    AgentDefinitionUpdateInput,
    AgentStudioUpdateInput,
    AgentVersionCreateInput,
    BrowserRtcSessionCreateInput,
    CallReviewCreateInput,
    CallReviewUpdateInput,
    EvalCaseCreateInput,
    EvalCaseResultInput,
    EvalCaseUpdateInput,
    EvalRunCreateInput,
    EvalSuiteCreateInput,
    EvalSuiteUpdateInput,
    LiveTestSessionUpdateInput,
    LoginInput,
    ProviderAccountCreateInput,
    ProviderAccountUpdateInput,
    TeamMemberCreateInput,
    TeamMemberUpdateInput,
    TenantCreateInput,
    TenantUpdateInput,
    WorkspaceCreateInput,
    WorkspaceUpdateInput,
)
from voice_backend.security import create_session_token
from voice_backend.services import (
    AgentCatalogService,
    AgentDefinitionAdminService,
    AuthenticationService,
    CallHistoryService,
    CallReviewService,
    EvaluationService,
    LiveTestSessionService,
    ProviderAccountAdminService,
    RealtimeSessionError,
    RealtimeSessionService,
    TeamAdminService,
    TenantAdminService,
    TenantOverviewService,
    WorkspaceAdminService,
    WorkspaceStateService,
)
from voice_backend.services.authentication import clear_session_cache
from voice_backend.services.evaluation import resolve_live_case
from voice_backend.services.read_cache import clear_read_cache

router = APIRouter(prefix="/api/v1")
SessionDependency = Annotated[Session, Depends(get_request_session)]
AuthDependency = Annotated[AuthContext, Depends(get_current_auth)]
MutationResult = TypeVar("MutationResult")
_LIVE_EVALUATION_TASKS: set[asyncio.Task[None]] = set()
logger = get_logger(__name__)


def _finish_live_evaluation_task(task: asyncio.Task[None]) -> None:
    _LIVE_EVALUATION_TASKS.discard(task)
    try:
        task.result()
    except asyncio.CancelledError:
        logger.info("evaluation.live.task.cancelled")
    except Exception as exc:
        logger.error("evaluation.live.task.failed", error=str(exc))


def _execute_write(session: Session, operation: Callable[[], MutationResult]) -> MutationResult:
    try:
        result = operation()
        session.commit()
        clear_session_cache()
        clear_read_cache()
        return result
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="resource conflict") from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(status_code=500, detail="database operation failed") from exc


def _tenant_id_from_auth(auth: AuthContext, tenant_slug: str):
    membership = next((item for item in auth.memberships if item.tenant_slug == tenant_slug), None)
    return membership.tenant_id if membership is not None else None


def _workspace_membership_from_auth(auth: AuthContext, tenant_slug: str, workspace_id: UUID):
    return next(
        (
            item
            for item in auth.memberships
            if item.tenant_slug == tenant_slug and item.workspace_id == workspace_id
        ),
        None,
    )


def _set_session_cookie(response: Response, request: Request, user_id: UUID) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        settings.session_cookie_name,
        create_session_token(
            user_id,
            secret=settings.session_secret,
            ttl_seconds=settings.session_ttl_hours * 3600,
        ),
        httponly=True,
        samesite="lax",
        secure=settings.environment == "prod",
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


@router.post("/auth/login")
def login(
    payload: LoginInput,
    request: Request,
    response: Response,
    session: SessionDependency,
):
    auth_session = AuthenticationService(session).authenticate(payload.email, payload.password)
    if auth_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    _set_session_cookie(response, request, auth_session.user.user_id)
    return auth_session.model_dump()


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    settings = request.app.state.settings
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.environment == "prod",
    )
    return response


@router.get("/auth/me")
def get_auth_me(auth: AuthDependency, session: SessionDependency):
    current = AuthenticationService(session).get_session(auth.user_id)
    if current is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")
    return current.model_dump()


@router.get("/tenants")
def list_tenants(session: SessionDependency, auth: AuthDependency):
    tenants = TenantAdminService(session).list_tenants()
    if auth.is_platform_admin:
        return [item.model_dump() for item in tenants]
    visible_slugs = {membership.tenant_slug for membership in auth.memberships}
    return [item.model_dump() for item in tenants if item.tenant_slug in visible_slugs]


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreateInput, session: SessionDependency, auth: AuthDependency):
    require_platform_admin(auth)
    created = _execute_write(session, lambda: TenantAdminService(session).create_tenant(payload))
    return created.model_dump()


@router.get("/tenants/{tenant_slug}")
def get_tenant(tenant_slug: str, session: SessionDependency, auth: AuthDependency):
    require_tenant_access(auth, tenant_slug)
    tenant = TenantAdminService(session).get_tenant(tenant_slug)
    if tenant is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return tenant.model_dump()


@router.patch("/tenants/{tenant_slug}")
def update_tenant(
    tenant_slug: str,
    payload: TenantUpdateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_platform_admin(auth)
    updated = _execute_write(
        session, lambda: TenantAdminService(session).update_tenant(tenant_slug, payload)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return updated.model_dump()


@router.delete("/tenants/{tenant_slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(tenant_slug: str, session: SessionDependency, auth: AuthDependency) -> Response:
    require_platform_admin(auth)
    deleted = _execute_write(
        session, lambda: TenantAdminService(session).delete_tenant(tenant_slug)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="tenant not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/overview")
def get_tenant_overview(tenant_slug: str, session: SessionDependency, auth: AuthDependency):
    require_tenant_access(auth, tenant_slug)
    overview = TenantOverviewService(session).get_by_slug(tenant_slug)
    if overview is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return overview.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces")
def list_workspaces(tenant_slug: str, session: SessionDependency, auth: AuthDependency):
    require_tenant_access(auth, tenant_slug)
    workspaces = WorkspaceAdminService(session).list_workspaces(
        tenant_slug,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if workspaces is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return [item.model_dump() for item in workspaces]


@router.post("/tenants/{tenant_slug}/workspaces", status_code=status.HTTP_201_CREATED)
def create_workspace(
    tenant_slug: str,
    payload: WorkspaceCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_tenant_write_access(auth, tenant_slug)
    created = _execute_write(
        session,
        lambda: WorkspaceAdminService(session).create_workspace(
            tenant_slug, payload, owner_user_id=auth.user_id
        ),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}")
def get_workspace(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    workspace = WorkspaceAdminService(session).get_workspace(tenant_slug, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return workspace.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/app-state")
def get_workspace_app_state(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    state = WorkspaceStateService(session).get_state(
        tenant_slug,
        workspace_id,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
        workspace_membership=_workspace_membership_from_auth(auth, tenant_slug, workspace_id),
    )
    if state is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return state.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}")
def update_workspace(
    tenant_slug: str,
    workspace_id: UUID,
    payload: WorkspaceUpdateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_admin_access(auth, tenant_slug, workspace_id)
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
def delete_workspace(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
) -> Response:
    require_workspace_admin_access(auth, tenant_slug, workspace_id)
    deleted = _execute_write(
        session,
        lambda: WorkspaceAdminService(session).delete_workspace(tenant_slug, workspace_id),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="workspace not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/members")
def list_team_members(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    members = TeamAdminService(session).list_members(
        tenant_slug,
        workspace_id,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if members is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in members]


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED
)
def create_team_member(
    tenant_slug: str,
    workspace_id: UUID,
    payload: TeamMemberCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_admin_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
):
    require_workspace_admin_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
) -> Response:
    require_workspace_admin_access(auth, tenant_slug, workspace_id)
    deleted = _execute_write(
        session,
        lambda: TeamAdminService(session).delete_member(tenant_slug, workspace_id, membership_id),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="team member not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/agents")
def list_workspace_agents(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    summaries = AgentCatalogService(session).list_workspace_agents(
        tenant_slug,
        workspace_id,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
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
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    tenant_slug: str,
    workspace_id: UUID,
    agent_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
) -> Response:
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
    limit: int = Query(default=20, ge=1, le=100),
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    summaries = CallHistoryService(session).list_recent_calls(
        tenant_slug,
        workspace_id,
        limit=limit,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if summaries is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in summaries]


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/logs")
def list_call_logs(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    status: Literal["Completed", "Follow-up", "Dropped"] | None = Query(default=None),
    call_type: Literal["all", "production", "test"] = Query(default="all"),
    query: str | None = Query(default=None, max_length=120),
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    response = CallHistoryService(session).list_call_logs(
        tenant_slug,
        workspace_id,
        page=page,
        page_size=page_size,
        status=status,
        call_type=call_type,
        query=query,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if response is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return response.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations")
def list_evaluation_suites(
    tenant_slug: str,
    workspace_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    suites = EvaluationService(session).list_suites(
        tenant_slug,
        workspace_id,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if suites is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return [item.model_dump() for item in suites]


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/runs/{run_id}")
def get_evaluation_run(
    tenant_slug: str,
    workspace_id: UUID,
    run_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    run = EvaluationService(session).get_run(tenant_slug, workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="evaluation run not found")
    return run.model_dump()


@router.get(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/calls/{call_id}/recording",
    response_class=FileResponse,
)
def get_call_recording(
    tenant_slug: str,
    workspace_id: UUID,
    call_id: UUID,
    request: Request,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    tenant_id = _tenant_id_from_auth(auth, tenant_slug)
    call = CallRepository(session).get_for_workspace(tenant_id, workspace_id, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="call not found")
    recording = call.resolved_config.get("recording", {}) if call.resolved_config else {}
    filename = recording.get("filename") if isinstance(recording, dict) else None
    if not isinstance(filename, str) or not filename or Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="call recording not available")
    recording_path = Path(request.app.state.settings.recordings_dir) / filename
    if not recording_path.is_file():
        raise HTTPException(status_code=404, detail="call recording not available")
    return FileResponse(recording_path, media_type="audio/wav", filename=filename)


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}/runs")
def list_evaluation_runs(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
    limit: int = Query(default=50, ge=1, le=100),
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    runs = EvaluationService(session).list_runs(tenant_slug, workspace_id, suite_id, limit=limit)
    if runs is None:
        raise HTTPException(status_code=404, detail="evaluation suite not found")
    return [item.model_dump() for item in runs]


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations",
    status_code=status.HTTP_201_CREATED,
)
def create_evaluation_suite(
    tenant_slug: str,
    workspace_id: UUID,
    payload: EvalSuiteCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    created = _execute_write(
        session,
        lambda: EvaluationService(session).create_suite(tenant_slug, workspace_id, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="evaluation dependencies not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}")
def get_evaluation_suite(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_access(auth, tenant_slug, workspace_id)
    suite = EvaluationService(session).get_suite(tenant_slug, workspace_id, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail="evaluation suite not found")
    return suite.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}")
def update_evaluation_suite(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    payload: EvalSuiteUpdateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    updated = _execute_write(
        session,
        lambda: EvaluationService(session).update_suite(
            tenant_slug, workspace_id, suite_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="evaluation suite not found")
    return updated.model_dump()


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}/cases",
    status_code=status.HTTP_201_CREATED,
)
def create_evaluation_case(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    payload: EvalCaseCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    created = _execute_write(
        session,
        lambda: EvaluationService(session).create_case(
            tenant_slug, workspace_id, suite_id, payload
        ),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="evaluation suite not found")
    return created.model_dump()


@router.patch(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}/cases/{case_id}"
)
def update_evaluation_case(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    case_id: UUID,
    payload: EvalCaseUpdateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    updated = _execute_write(
        session,
        lambda: EvaluationService(session).update_case(
            tenant_slug, workspace_id, suite_id, case_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="evaluation case not found")
    return updated.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}/cases/{case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_evaluation_case(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    case_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
) -> Response:
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    deleted = _execute_write(
        session,
        lambda: EvaluationService(session).delete_case(
            tenant_slug, workspace_id, suite_id, case_id
        ),
    )
    if deleted is not True:
        raise HTTPException(status_code=404, detail="evaluation case not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _execute_live_evaluation_run(settings, tenant_slug: str, workspace_id, run_id):
    factory = create_session_factory(settings)
    with factory() as background_session:
        await EvaluationService(background_session).execute_live_run(
            settings,
            tenant_slug,
            workspace_id,
            run_id,
        )


@router.post("/tenants/{tenant_slug}/workspaces/{workspace_id}/evaluations/{suite_id}/runs")
async def run_evaluation_suite(
    tenant_slug: str,
    workspace_id: UUID,
    suite_id: UUID,
    payload: EvalRunCreateInput,
    request: Request,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    service = EvaluationService(session)
    try:
        run = _execute_write(
            session,
            lambda: service.create_live_run(tenant_slug, workspace_id, suite_id, payload)
            if payload.execution_mode == "live_audio"
            else service.run_suite(tenant_slug, workspace_id, suite_id, payload),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if run is None:
        raise HTTPException(status_code=404, detail="evaluation suite not found")
    if payload.execution_mode == "live_audio":
        task = asyncio.create_task(
            _execute_live_evaluation_run(
                request.app.state.settings,
                tenant_slug,
                workspace_id,
                run.run_id,
            )
        )
        _LIVE_EVALUATION_TASKS.add(task)
        task.add_done_callback(_finish_live_evaluation_task)
    return run.model_dump()


@router.post("/internal/evaluations/case-results", status_code=status.HTTP_202_ACCEPTED)
def receive_live_evaluation_result(payload: EvalCaseResultInput, request: Request):
    if request.headers.get("X-Voice-Internal-Key") != request.app.state.settings.internal_api_key:
        raise HTTPException(status_code=401, detail="invalid internal API key")
    if not resolve_live_case(payload.execution_id, payload.evidence):
        raise HTTPException(status_code=404, detail="evaluation execution not waiting")
    return {"accepted": True, "execution_id": payload.execution_id}


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/live/sessions",
    status_code=status.HTTP_201_CREATED,
)
async def create_browser_rtc_session(
    tenant_slug: str,
    workspace_id: UUID,
    payload: BrowserRtcSessionCreateInput,
    request: Request,
    session: SessionDependency,
    auth: AuthDependency,
):
    request_started_at = perf_counter()
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    prepare_started_at = perf_counter()
    try:
        prepared = LiveTestSessionService(session).prepare_browser_session(
            tenant_slug, workspace_id, payload
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if prepared is None:
        raise HTTPException(status_code=404, detail="live test session dependencies not found")
    logger.info(
        "live.session.step",
        step="browser_session_prepared",
        duration_ms=round((perf_counter() - prepare_started_at) * 1000, 2),
    )
    realtime = RealtimeSessionService(request.app.state.settings)
    realtime_started_at = perf_counter()
    try:
        created = await realtime.create_browser_session(
            prepared.session_input,
            user_id=auth.user_id,
            display_name=auth.display_name,
        )
    except RealtimeSessionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    logger.info(
        "live.session.step",
        step="realtime_session_created",
        duration_ms=round((perf_counter() - realtime_started_at) * 1000, 2),
    )
    persist_started_at = perf_counter()
    try:
        live_record = _execute_write(
            session,
            lambda: LiveTestSessionService(session).create_session_record(
                tenant_slug,
                workspace_id,
                prepared.session_input,
                created,
                launched_by=auth.email,
                prepared=prepared,
            ),
        )
    except Exception:
        await realtime.cleanup_browser_session(
            room_name=created.room_name, dispatch_id=created.dispatch_id
        )
        raise
    if live_record is None:
        await realtime.cleanup_browser_session(
            room_name=created.room_name, dispatch_id=created.dispatch_id
        )
        raise HTTPException(status_code=404, detail="live test agent not found")
    logger.info(
        "live.session.step",
        step="browser_call_persisted",
        duration_ms=round((perf_counter() - persist_started_at) * 1000, 2),
        total_duration_ms=round((perf_counter() - request_started_at) * 1000, 2),
    )
    created.call_id = live_record.call_id
    return created.model_dump()


@router.patch("/tenants/{tenant_slug}/workspaces/{workspace_id}/live/sessions/{call_id}")
async def update_live_test_session(
    tenant_slug: str,
    workspace_id: UUID,
    call_id: UUID,
    payload: LiveTestSessionUpdateInput,
    request: Request,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    updated = _execute_write(
        session,
        lambda: LiveTestSessionService(session).update_session_record(
            tenant_slug, workspace_id, call_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="live test session not found")
    if payload.lifecycle_status in {"completed", "failed", "cancelled"}:
        try:
            await asyncio.wait_for(
                RealtimeSessionService(request.app.state.settings).cleanup_browser_session(
                    room_name=updated.room_name,
                    dispatch_id=updated.dispatch_id or None,
                ),
                timeout=3,
            )
        except Exception as cleanup_error:
            logger.warning(
                "live.session.cleanup_failed",
                call_id=str(call_id),
                error=cleanup_error.__class__.__name__,
            )
    return updated.model_dump()


@router.post(
    "/tenants/{tenant_slug}/workspaces/{workspace_id}/calls", status_code=status.HTTP_201_CREATED
)
def create_call_review(
    tenant_slug: str,
    workspace_id: UUID,
    payload: CallReviewCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
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
    auth: AuthDependency,
):
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    updated = _execute_write(
        session,
        lambda: CallReviewService(session).update_review(
            tenant_slug, workspace_id, call_id, payload
        ),
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
    auth: AuthDependency,
) -> Response:
    require_workspace_write_access(auth, tenant_slug, workspace_id)
    deleted = _execute_write(
        session,
        lambda: CallReviewService(session).delete_review(tenant_slug, workspace_id, call_id),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="call not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_slug}/provider-accounts")
def list_provider_accounts(tenant_slug: str, session: SessionDependency, auth: AuthDependency):
    require_tenant_access(auth, tenant_slug)
    accounts = ProviderAccountAdminService(session).list_accounts(
        tenant_slug,
        tenant_id=_tenant_id_from_auth(auth, tenant_slug),
    )
    if accounts is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return [item.model_dump() for item in accounts]


@router.post("/tenants/{tenant_slug}/provider-accounts", status_code=status.HTTP_201_CREATED)
def create_provider_account(
    tenant_slug: str,
    payload: ProviderAccountCreateInput,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_tenant_write_access(auth, tenant_slug)
    created = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).create_account(tenant_slug, payload),
    )
    if created is None:
        raise HTTPException(status_code=404, detail="tenant not found")
    return created.model_dump()


@router.get("/tenants/{tenant_slug}/provider-accounts/{provider_account_id}")
def get_provider_account(
    tenant_slug: str,
    provider_account_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_tenant_access(auth, tenant_slug)
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
    auth: AuthDependency,
):
    require_tenant_write_access(auth, tenant_slug)
    updated = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).update_account(
            tenant_slug, provider_account_id, payload
        ),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="provider account not found")
    return updated.model_dump()


@router.post("/tenants/{tenant_slug}/provider-accounts/{provider_account_id}/health-check")
def run_provider_account_health_check(
    tenant_slug: str,
    provider_account_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
):
    require_tenant_write_access(auth, tenant_slug)
    checked = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).run_health_check(
            tenant_slug, provider_account_id
        ),
    )
    if checked is None:
        raise HTTPException(status_code=404, detail="provider account not found")
    return checked.model_dump()


@router.delete(
    "/tenants/{tenant_slug}/provider-accounts/{provider_account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_provider_account(
    tenant_slug: str,
    provider_account_id: UUID,
    session: SessionDependency,
    auth: AuthDependency,
) -> Response:
    require_tenant_write_access(auth, tenant_slug)
    deleted = _execute_write(
        session,
        lambda: ProviderAccountAdminService(session).delete_account(
            tenant_slug, provider_account_id
        ),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="provider account not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
