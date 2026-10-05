from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)  # admin / accountant / ...
    name: Mapped[str] = mapped_column(String(64))
    permissions: Mapped[list] = mapped_column(JSON, default=list)  # ["voucher:create", ...]


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(32), index=True)
    avatar_color: Mapped[str] = mapped_column(String(16), default="#1B5FE3")
    is_active: Mapped[bool] = mapped_column(default=True)
