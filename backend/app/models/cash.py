from typing import Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(16))  # bank / cash
    bank_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    account_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="CNY")
    initial_balance: Mapped[float] = mapped_column(Float, default=0)
    gl_account_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class CashFlow(Base):
    __tablename__ = "cash_flows"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    period: Mapped[str] = mapped_column(String(7), index=True)
    account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id"), index=True)
    type: Mapped[str] = mapped_column(String(16))  # income / expense / transfer
    category: Mapped[str] = mapped_column(String(64))
    counterparty: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    summary: Mapped[str] = mapped_column(String(256))
    related_account_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    voucher_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
