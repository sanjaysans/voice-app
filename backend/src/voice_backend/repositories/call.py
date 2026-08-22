import uuid
from typing import ClassVar

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from voice_backend.models import AgentVersion, Call


class CallRepository:
    ACTIVE_STATUSES: ClassVar[set[str]] = {"queued", "ringing", "in_progress"}

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        tenant_id,
        workspace_id,
        direction: str,
        status: str,
        agent_version_id=None,
        from_number: str | None = None,
        to_number: str | None = None,
        resolved_config: dict[str, object] | None = None,
    ) -> Call:
        call = Call(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            agent_version_id=agent_version_id,
            direction=direction,
            status=status,
            from_number=from_number,
            to_number=to_number,
            resolved_config=resolved_config or {},
        )
        self.session.add(call)
        self.session.flush()
        return call

    def list_recent_by_workspace(self, tenant_id, workspace_id, limit: int = 20) -> list[Call]:
        statement = (
            select(Call)
            .where(
                Call.tenant_id == tenant_id,
                Call.workspace_id == workspace_id,
            )
            .options(joinedload(Call.agent_version).joinedload(AgentVersion.agent_definition))
            .order_by(desc(Call.created_at))
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique())

    def count_active_by_tenant(self, tenant_id) -> int:
        statement = select(func.count()).select_from(Call).where(
            Call.tenant_id == tenant_id,
            Call.status.in_(self.ACTIVE_STATUSES),
        )
        return int(self.session.scalar(statement) or 0)

    def count_all_by_tenant(self, tenant_id) -> int:
        statement = select(func.count()).select_from(Call).where(Call.tenant_id == tenant_id)
        return int(self.session.scalar(statement) or 0)

    def update_status(self, tenant_id, call_id, status: str) -> Call | None:
        normalized_call_id = call_id
        if isinstance(call_id, str):
            try:
                normalized_call_id = uuid.UUID(call_id)
            except ValueError:
                return None

        statement = select(Call).where(
            Call.tenant_id == tenant_id,
            Call.id == normalized_call_id,
        )
        call = self.session.scalar(statement)
        if call is None:
            return None
        call.status = status
        self.session.flush()
        return call
