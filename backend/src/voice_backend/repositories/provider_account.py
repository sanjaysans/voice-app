import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from voice_backend.models import ProviderAccount


class ProviderAccountRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        tenant_id,
        provider_kind: str,
        vendor_name: str,
        label: str,
        *,
        status: str = "draft",
        config: dict[str, object] | None = None,
    ) -> ProviderAccount:
        account = ProviderAccount(
            tenant_id=tenant_id,
            provider_kind=provider_kind,
            vendor_name=vendor_name,
            label=label,
            status=status,
            config=config or {},
        )
        self.session.add(account)
        self.session.flush()
        return account

    def list_by_tenant(self, tenant_id) -> list[ProviderAccount]:
        statement = (
            select(ProviderAccount)
            .where(ProviderAccount.tenant_id == tenant_id)
            .order_by(ProviderAccount.provider_kind, ProviderAccount.label)
        )
        return list(self.session.scalars(statement))

    def get_for_tenant(self, tenant_id, provider_account_id) -> ProviderAccount | None:
        normalized_provider_account_id = provider_account_id
        if isinstance(provider_account_id, str):
            try:
                normalized_provider_account_id = uuid.UUID(provider_account_id)
            except ValueError:
                return None
        statement = select(ProviderAccount).where(
            ProviderAccount.tenant_id == tenant_id,
            ProviderAccount.id == normalized_provider_account_id,
        )
        return self.session.scalar(statement)

    def get_many_for_tenant(
        self, tenant_id, provider_account_ids: Iterable[object]
    ) -> dict[uuid.UUID, ProviderAccount]:
        normalized_ids: set[uuid.UUID] = set()
        for provider_account_id in provider_account_ids:
            if isinstance(provider_account_id, uuid.UUID):
                normalized_ids.add(provider_account_id)
            elif isinstance(provider_account_id, str):
                try:
                    normalized_ids.add(uuid.UUID(provider_account_id))
                except ValueError:
                    continue
        if not normalized_ids:
            return {}

        statement = select(ProviderAccount).where(
            ProviderAccount.tenant_id == tenant_id,
            ProviderAccount.id.in_(normalized_ids),
        )
        accounts = self.session.scalars(statement)
        return {account.id: account for account in accounts}

    def update(
        self,
        account: ProviderAccount,
        *,
        provider_kind: str | None = None,
        vendor_name: str | None = None,
        label: str | None = None,
        status: str | None = None,
        config: dict[str, object] | None = None,
    ) -> ProviderAccount:
        if provider_kind is not None:
            account.provider_kind = provider_kind
        if vendor_name is not None:
            account.vendor_name = vendor_name
        if label is not None:
            account.label = label
        if status is not None:
            account.status = status
        if config is not None:
            account.config = {**(account.config or {}), **config}
        self.session.flush()
        return account

    def delete(self, account: ProviderAccount) -> None:
        self.session.delete(account)
        self.session.flush()
