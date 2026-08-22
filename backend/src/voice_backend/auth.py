from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from voice_backend.database import get_request_session
from voice_backend.schemas import SessionMembershipRecord
from voice_backend.security import SessionPayload, decode_session_token
from voice_backend.services.authentication import AuthenticationService

RequestSession = Session
RequestSessionDependency = Depends(get_request_session)


@dataclass(frozen=True)
class AuthContext:
    payload: SessionPayload
    user_id: UUID
    email: str
    display_name: str
    is_platform_admin: bool
    memberships: tuple[SessionMembershipRecord, ...]
    active_membership: SessionMembershipRecord | None


def get_current_auth(
    request: Request,
    session: RequestSession = RequestSessionDependency,
) -> AuthContext:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required"
        )

    payload = decode_session_token(token, secret=settings.session_secret)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")

    auth_session = AuthenticationService(session).get_session(payload.user_id)
    if auth_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")

    return AuthContext(
        payload=payload,
        user_id=auth_session.user.user_id,
        email=auth_session.user.email,
        display_name=auth_session.user.display_name,
        is_platform_admin=auth_session.user.is_platform_admin,
        memberships=tuple(auth_session.memberships),
        active_membership=auth_session.active_membership,
    )


def require_platform_admin(auth: AuthContext) -> None:
    if auth.is_platform_admin:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="platform admin required")


def require_tenant_access(auth: AuthContext, tenant_slug: str) -> None:
    if auth.is_platform_admin or any(
        membership.tenant_slug == tenant_slug for membership in auth.memberships
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant access denied")


def require_workspace_access(auth: AuthContext, tenant_slug: str, workspace_id: UUID) -> None:
    if auth.is_platform_admin:
        return
    if any(
        membership.tenant_slug == tenant_slug and membership.workspace_id == workspace_id
        for membership in auth.memberships
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="workspace access denied")


def require_tenant_write_access(auth: AuthContext, tenant_slug: str) -> None:
    if auth.is_platform_admin:
        return
    if any(
        membership.tenant_slug == tenant_slug and membership.role in {"admin", "editor"}
        for membership in auth.memberships
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant write access denied")


def require_workspace_write_access(auth: AuthContext, tenant_slug: str, workspace_id: UUID) -> None:
    if auth.is_platform_admin:
        return
    if any(
        membership.tenant_slug == tenant_slug
        and membership.workspace_id == workspace_id
        and membership.role in {"admin", "editor"}
        for membership in auth.memberships
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="workspace write access denied"
    )


def require_workspace_admin_access(auth: AuthContext, tenant_slug: str, workspace_id: UUID) -> None:
    if auth.is_platform_admin:
        return
    if any(
        membership.tenant_slug == tenant_slug
        and membership.workspace_id == workspace_id
        and membership.role == "admin"
        for membership in auth.memberships
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="workspace admin access denied"
    )
