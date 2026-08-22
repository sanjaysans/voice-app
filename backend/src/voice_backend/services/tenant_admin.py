from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import TenantRepository
from voice_backend.schemas import TenantCreateInput, TenantRecord, TenantUpdateInput

logger = get_logger(__name__)


def _to_record(tenant) -> TenantRecord:
    return TenantRecord(
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        status=tenant.status,
        created_at=tenant.created_at,
    )


class TenantAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)

    def list_tenants(self) -> list[TenantRecord]:
        return [_to_record(tenant) for tenant in self.tenants.list_all()]

    def create_tenant(self, payload: TenantCreateInput) -> TenantRecord:
        tenant = self.tenants.create(slug=payload.slug, name=payload.name, status=payload.status)
        logger.info("tenant.created", tenant_id=str(tenant.id), tenant_slug=tenant.slug)
        return _to_record(tenant)

    def get_tenant(self, tenant_slug: str) -> TenantRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        return _to_record(tenant) if tenant is not None else None

    def update_tenant(self, tenant_slug: str, payload: TenantUpdateInput) -> TenantRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        updated = self.tenants.update(
            tenant,
            slug=payload.slug,
            name=payload.name,
            status=payload.status,
        )
        logger.info("tenant.updated", tenant_id=str(updated.id), tenant_slug=updated.slug)
        return _to_record(updated)

    def delete_tenant(self, tenant_slug: str) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        self.tenants.delete(tenant)
        logger.info("tenant.deleted", tenant_id=str(tenant.id), tenant_slug=tenant.slug)
        return True
