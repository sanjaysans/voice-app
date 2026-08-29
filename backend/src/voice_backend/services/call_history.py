from math import ceil

from sqlalchemy.orm import Session

from voice_backend.repositories import CallRepository, TenantRepository, WorkspaceRepository
from voice_backend.schemas import CallLogListResponse, CallSummary
from voice_backend.services.read_cache import get_read_cache, set_read_cache
from voice_backend.services.workspace_state import _build_call_record


class CallHistoryService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.calls = CallRepository(session)

    def list_recent_calls(
        self,
        tenant_slug: str,
        workspace_id,
        limit: int = 20,
        *,
        tenant_id=None,
    ) -> list[CallSummary] | None:
        cache_key = (
            "call-history.recent",
            tenant_slug,
            str(workspace_id),
            str(limit),
            str(tenant_id or ""),
        )
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

        items: list[CallSummary] = []
        for call in self.calls.list_recent_by_workspace(
            resolved_tenant_id, workspace_id, limit=limit
        ):
            agent_name = None
            if call.agent_version and call.agent_version.agent_definition:
                agent_name = call.agent_version.agent_definition.name
            items.append(
                CallSummary(
                    call_id=call.id,
                    workspace_id=call.workspace_id,
                    agent_name=agent_name,
                    direction=call.direction,
                    status=call.status,
                    is_test=call.is_test,
                    from_number=call.from_number,
                    to_number=call.to_number,
                    started_at=call.started_at,
                    ended_at=call.ended_at,
                    created_at=call.created_at,
                )
            )
        return set_read_cache(cache_key, items)

    def list_call_logs(
        self,
        tenant_slug: str,
        workspace_id,
        *,
        page: int = 1,
        page_size: int = 10,
        status: str | None = None,
        call_type: str = "all",
        query: str | None = None,
        tenant_id=None,
    ) -> CallLogListResponse | None:
        cache_key = (
            "call-history.logs",
            tenant_slug,
            str(workspace_id),
            str(page),
            str(page_size),
            str(status or ""),
            call_type,
            str(query or ""),
            str(tenant_id or ""),
        )
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

        calls, total_items = self.calls.list_call_logs_page(
            resolved_tenant_id,
            workspace_id,
            page=page,
            page_size=page_size,
            status_label=status,
            call_type=call_type,
            query=query,
        )
        records = [_build_call_record(call) for call in calls]
        total_pages = max(ceil(total_items / page_size), 1)
        end_index = max(page - 1, 0) * page_size + len(records)

        return set_read_cache(
            cache_key,
            CallLogListResponse(
                items=records,
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_previous=page > 1,
                has_next=end_index < total_items,
            ),
        )
