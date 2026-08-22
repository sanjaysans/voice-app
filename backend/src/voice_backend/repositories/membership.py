from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from voice_backend.models import TenantMembership


class MembershipRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, tenant_id, workspace_id, user_id, role: str) -> TenantMembership:
        membership = TenantMembership(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
        )
        self.session.add(membership)
        self.session.flush()
        return membership

    def list_by_workspace(self, tenant_id, workspace_id) -> list[TenantMembership]:
        statement = (
            select(TenantMembership)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.workspace_id == workspace_id,
            )
            .options(joinedload(TenantMembership.user))
            .order_by(TenantMembership.created_at)
        )
        return list(self.session.scalars(statement))

    def get_for_workspace(self, tenant_id, workspace_id, membership_id) -> TenantMembership | None:
        statement = (
            select(TenantMembership)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.workspace_id == workspace_id,
                TenantMembership.id == membership_id,
            )
            .options(joinedload(TenantMembership.user))
        )
        return self.session.scalar(statement)

    def list_by_user(self, user_id) -> list[TenantMembership]:
        statement = (
            select(TenantMembership)
            .where(TenantMembership.user_id == user_id)
            .options(
                joinedload(TenantMembership.user),
                joinedload(TenantMembership.workspace),
                joinedload(TenantMembership.tenant),
            )
            .order_by(TenantMembership.created_at)
        )
        return list(self.session.scalars(statement))

    def update(self, membership: TenantMembership, *, role: str | None = None) -> TenantMembership:
        if role is not None:
            membership.role = role
        self.session.flush()
        return membership

    def delete(self, membership: TenantMembership) -> None:
        self.session.delete(membership)
        self.session.flush()
