from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import MembershipRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import WorkspaceCreateInput, WorkspaceRecord, WorkspaceUpdateInput
from voice_backend.services.read_cache import clear_read_cache, get_read_cache, set_read_cache

logger = get_logger(__name__)


def _to_record(workspace) -> WorkspaceRecord:
    return WorkspaceRecord(
        workspace_id=workspace.id,
        tenant_id=workspace.tenant_id,
        name=workspace.name,
        is_default=workspace.is_default,
        created_at=workspace.created_at,
    )


class WorkspaceAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.memberships = MembershipRepository(session)

    def list_workspaces(self, tenant_slug: str, *, tenant_id=None) -> list[WorkspaceRecord] | None:
        cache_key = ("workspace.list", tenant_slug, str(tenant_id or ""))
        cached = get_read_cache(cache_key)
        if cached is not None:
            return cached

        resolved_tenant_id = tenant_id
        if resolved_tenant_id is None:
            tenant = self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                return None
            resolved_tenant_id = tenant.id
        return set_read_cache(
            cache_key,
            [
                _to_record(workspace)
                for workspace in self.workspaces.list_by_tenant(resolved_tenant_id)
            ],
        )

    def create_workspace(
        self, tenant_slug: str, payload: WorkspaceCreateInput, *, owner_user_id=None
    ) -> WorkspaceRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.create(tenant.id, payload.name, is_default=payload.is_default)
        if workspace.is_default:
            self.workspaces.clear_default_for_tenant(tenant.id, except_workspace_id=workspace.id)
        if owner_user_id is not None:
            self.memberships.create(tenant.id, workspace.id, owner_user_id, "admin")
        clear_read_cache()
        logger.info("workspace.created", tenant_id=str(tenant.id), workspace_id=str(workspace.id))
        return _to_record(workspace)

    def get_workspace(self, tenant_slug: str, workspace_id) -> WorkspaceRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        return _to_record(workspace) if workspace is not None else None

    def update_workspace(
        self,
        tenant_slug: str,
        workspace_id,
        payload: WorkspaceUpdateInput,
    ) -> WorkspaceRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return None
        updated = self.workspaces.update(
            workspace, name=payload.name, is_default=payload.is_default
        )
        if updated.is_default:
            self.workspaces.clear_default_for_tenant(tenant.id, except_workspace_id=updated.id)
        clear_read_cache()
        logger.info("workspace.updated", tenant_id=str(tenant.id), workspace_id=str(updated.id))
        return _to_record(updated)

    def delete_workspace(self, tenant_slug: str, workspace_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        if workspace is None:
            return False
        was_default = workspace.is_default
        self.workspaces.delete(workspace)
        if was_default:
            remaining = self.workspaces.list_by_tenant(tenant.id)
            if remaining and not any(item.is_default for item in remaining):
                self.workspaces.update(remaining[0], is_default=True)
        clear_read_cache()
        logger.info("workspace.deleted", tenant_id=str(tenant.id), workspace_id=str(workspace.id))
        return True
