from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import ProviderAccountRepository, TenantRepository
from voice_backend.schemas import (
    ProviderAccountCreateInput,
    ProviderAccountRecord,
    ProviderAccountUpdateInput,
)

logger = get_logger(__name__)

SAFE_PREVIEW_KEYS = {
    "name",
    "description",
    "ui_status",
    "detail",
    "last_checked",
    "url",
    "events",
    "deliveries",
    "signing_secret_preview",
}


def _to_record(account) -> ProviderAccountRecord:
    config = account.config or {}
    return ProviderAccountRecord(
        provider_account_id=account.id,
        tenant_id=account.tenant_id,
        provider_kind=account.provider_kind,
        vendor_name=account.vendor_name,
        label=account.label,
        status=account.status,
        has_config=bool(config),
        config_keys=sorted(config.keys()),
        preview={key: config[key] for key in sorted(config.keys()) if key in SAFE_PREVIEW_KEYS},
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


class ProviderAccountAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.accounts = ProviderAccountRepository(session)

    def list_accounts(self, tenant_slug: str) -> list[ProviderAccountRecord] | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        return [_to_record(account) for account in self.accounts.list_by_tenant(tenant.id)]

    def create_account(
        self,
        tenant_slug: str,
        payload: ProviderAccountCreateInput,
    ) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.create(
            tenant.id,
            payload.provider_kind,
            payload.vendor_name,
            payload.label,
            status=payload.status,
            config=payload.config,
        )
        logger.info(
            "provider_account.created",
            tenant_id=str(tenant.id),
            provider_account_id=str(account.id),
        )
        return _to_record(account)

    def get_account(self, tenant_slug: str, provider_account_id) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        return _to_record(account) if account is not None else None

    def update_account(
        self,
        tenant_slug: str,
        provider_account_id,
        payload: ProviderAccountUpdateInput,
    ) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        if account is None:
            return None
        updated = self.accounts.update(
            account,
            provider_kind=payload.provider_kind,
            vendor_name=payload.vendor_name,
            label=payload.label,
            status=payload.status,
            config=payload.config,
        )
        logger.info(
            "provider_account.updated",
            tenant_id=str(tenant.id),
            provider_account_id=str(updated.id),
        )
        return _to_record(updated)

    def delete_account(self, tenant_slug: str, provider_account_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        if account is None:
            return False
        self.accounts.delete(account)
        logger.info(
            "provider_account.deleted",
            tenant_id=str(tenant.id),
            provider_account_id=str(account.id),
        )
        return True
