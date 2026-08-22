from sqlalchemy import select
from sqlalchemy.orm import Session

from voice_backend.models import Tenant


class TenantRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, slug: str, name: str, status: str = "active") -> Tenant:
        tenant = Tenant(slug=slug, name=name, status=status)
        self.session.add(tenant)
        self.session.flush()
        return tenant

    def get_by_slug(self, slug: str) -> Tenant | None:
        return self.session.scalar(select(Tenant).where(Tenant.slug == slug))

    def list_all(self) -> list[Tenant]:
        return list(self.session.scalars(select(Tenant).order_by(Tenant.name)))
