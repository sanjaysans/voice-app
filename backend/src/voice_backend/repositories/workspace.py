from sqlalchemy import select
from sqlalchemy.orm import Session

from voice_backend.models import Workspace


class WorkspaceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, tenant_id, name: str, is_default: bool = False) -> Workspace:
        workspace = Workspace(tenant_id=tenant_id, name=name, is_default=is_default)
        self.session.add(workspace)
        self.session.flush()
        return workspace

    def list_by_tenant(self, tenant_id) -> list[Workspace]:
        statement = (
            select(Workspace).where(Workspace.tenant_id == tenant_id).order_by(Workspace.name)
        )
        return list(self.session.scalars(statement))

    def get_for_tenant(self, tenant_id, workspace_id) -> Workspace | None:
        statement = select(Workspace).where(
            Workspace.tenant_id == tenant_id,
            Workspace.id == workspace_id,
        )
        return self.session.scalar(statement)

    def clear_default_for_tenant(self, tenant_id, *, except_workspace_id=None) -> None:
        statement = select(Workspace).where(
            Workspace.tenant_id == tenant_id,
            Workspace.is_default.is_(True),
        )
        if except_workspace_id is not None:
            statement = statement.where(Workspace.id != except_workspace_id)
        for workspace in self.session.scalars(statement):
            workspace.is_default = False
        self.session.flush()

    def update(
        self,
        workspace: Workspace,
        *,
        name: str | None = None,
        is_default: bool | None = None,
    ) -> Workspace:
        if name is not None:
            workspace.name = name
        if is_default is not None:
            workspace.is_default = is_default
        self.session.flush()
        return workspace

    def delete(self, workspace: Workspace) -> None:
        self.session.delete(workspace)
        self.session.flush()
