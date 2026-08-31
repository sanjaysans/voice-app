from sqlalchemy.orm import Session

from voice_backend.repositories import (
    MembershipRepository,
    TenantRepository,
    UserRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import TeamMemberCreateInput, TeamMemberRecord, TeamMemberUpdateInput
from voice_backend.services.read_cache import clear_read_cache, get_read_cache, set_read_cache


def _to_record(membership) -> TeamMemberRecord:
    return TeamMemberRecord(
        membership_id=membership.id,
        user_id=membership.user_id,
        workspace_id=membership.workspace_id,
        email=membership.user.email,
        display_name=membership.user.display_name,
        role=membership.role,
        created_at=membership.created_at,
    )


class TeamAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.users = UserRepository(session)
        self.memberships = MembershipRepository(session)

    def list_members(
        self,
        tenant_slug: str,
        workspace_id,
        *,
        tenant_id=None,
    ) -> list[TeamMemberRecord] | None:
        cache_key = ("team-members.list", tenant_slug, str(workspace_id), str(tenant_id or ""))
        cached = get_read_cache(cache_key)
        if cached is not None:
            return cached

        resolved_tenant_id = tenant_id
        if resolved_tenant_id is None:
            tenant = self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                return None
            resolved_tenant_id = tenant.id

        workspace = self.workspaces.get_for_tenant(resolved_tenant_id, workspace_id)
        if workspace is None:
            return None
        return set_read_cache(
            cache_key,
            [
                _to_record(item)
                for item in self.memberships.list_by_workspace(resolved_tenant_id, workspace.id)
            ],
        )

    def create_member(
        self,
        tenant_slug: str,
        workspace_id,
        payload: TeamMemberCreateInput,
    ) -> TeamMemberRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        user = self.users.get_by_email(payload.email)
        if user is None:
            user = self.users.create(payload.email, payload.display_name)
        elif not any(item.tenant_id != tenant.id for item in user.memberships):
            self.users.update(user, display_name=payload.display_name)
        membership = self.memberships.create(tenant.id, workspace.id, user.id, payload.role)
        membership = self.memberships.get_for_workspace(tenant.id, workspace.id, membership.id)
        clear_read_cache()
        return _to_record(membership)

    def update_member(
        self,
        tenant_slug: str,
        workspace_id,
        membership_id,
        payload: TeamMemberUpdateInput,
    ) -> TeamMemberRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        membership = self.memberships.get_for_workspace(tenant.id, workspace.id, membership_id)
        if membership is None:
            return None
        self.memberships.update(membership, role=payload.role)
        if not any(item.tenant_id != tenant.id for item in membership.user.memberships):
            self.users.update(membership.user, display_name=payload.display_name)
        membership = self.memberships.get_for_workspace(tenant.id, workspace.id, membership.id)
        clear_read_cache()
        return _to_record(membership)

    def delete_member(self, tenant_slug: str, workspace_id, membership_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return False
        membership = self.memberships.get_for_workspace(tenant.id, workspace.id, membership_id)
        if membership is None:
            return False
        self.memberships.delete(membership)
        clear_read_cache()
        return True
