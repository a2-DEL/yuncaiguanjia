import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Account(Base):
    """会计科目（多级树形）。"""

    __tablename__ = "accounts"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)  # 1001 / 100101
    name: Mapped[str] = mapped_column(String(128))
    parent_code: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.code"), nullable=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    type: Mapped[str] = mapped_column(String(16))  # asset / liability / equity / cost / profit
    direction: Mapped[str] = mapped_column(String(8))  # debit / credit
    is_leaf: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active / disabled
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Voucher(Base):
    """记账凭证主表。"""

    __tablename__ = "vouchers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    voucher_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # 记-2026-10-0001
    date: Mapped[datetime.date] = mapped_column(DateTime, index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    creator: Mapped[str] = mapped_column(String(64))
    auditor: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    audited_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entries: Mapped[list["VoucherEntry"]] = relationship(
        back_populates="voucher", cascade="all, delete-orphan", order_by="VoucherEntry.id"
    )


class VoucherEntry(Base):
    """凭证明细行（多分录）。"""

    __tablename__ = "voucher_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    voucher_id: Mapped[str] = mapped_column(String(32), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str] = mapped_column(String(256))
    account_code: Mapped[str] = mapped_column(String(32), index=True)
    account_name: Mapped[str] = mapped_column(String(128))
    debit: Mapped[float] = mapped_column(Float, default=0)
    credit: Mapped[float] = mapped_column(Float, default=0)

    voucher: Mapped[Voucher] = relationship(back_populates="entries")


class Attachment(Base):
    """附件元数据，实际文件存 MinIO。"""

    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    voucher_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("vouchers.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(256))
    mime: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer, default=0)
    object_key: Mapped[str] = mapped_column(String(256))  # MinIO 中的 object key


class OperationLog(Base):
    __tablename__ = "logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    action: Mapped[str] = mapped_column(String(64))
    module: Mapped[str] = mapped_column(String(64), index=True)
    detail: Mapped[str] = mapped_column(Text)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    user_name: Mapped[str] = mapped_column(String(64))


class SystemSetting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
