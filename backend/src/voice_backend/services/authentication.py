from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from voice_backend.repositories import MembershipRepository, UserRepository
from voice_backend.schemas import SessionMembershipRecord, SessionRecord, SessionUserRecord
from voice_backend.security import verify_password


def clear_session_cache() -> None:
    """Retained for write-path compatibility; authorization is always read fresh."""


class AuthenticationService:
    def __init__(self, session: Session) -> None:
        self.users = UserRepository(session)
        self.memberships = MembershipRepository(session)

    def authenticate(self, email: str, password: str) -> SessionRecord | None:
        user = self.users.get_by_email(email.strip().lower())
        if user is None or not user.password_hash:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return self._build_session(user.id, user=user)

    def get_session(self, user_id: UUID) -> SessionRecord | None:
        return self._build_session(user_id)

    def _build_session(
        self, user_id: UUID, *, user=None
    ) -> SessionRecord | None:
        if user is None:
            user = self.users.get_by_id(user_id)
        if user is None:
            return None

        memberships = [
            SessionMembershipRecord(
                membership_id=membership.id,
                tenant_id=membership.tenant_id,
                tenant_slug=membership.tenant.slug,
                tenant_name=membership.tenant.name,
                workspace_id=membership.workspace_id,
                workspace_name=membership.workspace.name,
                workspace_is_default=membership.workspace.is_default,
                role=membership.role,
            )
            for membership in self.memberships.list_by_user(user.id)
        ]
        active_membership = next(
            (membership for membership in memberships if membership.workspace_is_default),
            memberships[0] if memberships else None,
        )

        record = SessionRecord(
            user=SessionUserRecord(
                user_id=user.id,
                email=user.email,
                display_name=user.display_name,
                is_platform_admin=user.is_platform_admin,
            ),
            memberships=memberships,
            active_membership=active_membership,
        )
        return record.model_copy(deep=True)
