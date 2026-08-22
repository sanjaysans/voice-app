from sqlalchemy import select
from sqlalchemy.orm import Session

from voice_backend.models import User


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, email: str, display_name: str, *, is_platform_admin: bool = False) -> User:
        user = User(
            email=email,
            display_name=display_name,
            is_platform_admin=is_platform_admin,
        )
        self.session.add(user)
        self.session.flush()
        return user

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalar(select(User).where(User.email == email))

    def update(self, user: User, *, display_name: str | None = None) -> User:
        if display_name is not None:
            user.display_name = display_name
        self.session.flush()
        return user
