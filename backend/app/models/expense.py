from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExpenseItem(Base):
    __tablename__ = "expense_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    claim_id: Mapped[str] = mapped_column(String(32), ForeignKey("expense_claims.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(String(256))
    amount: Mapped[float] = mapped_column(Float)
    account_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


class ExpenseClaim(Base):
    __tablename__ = "expense_claims"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    claim_no: Mapped[str] = mapped_column(String(32), index=True)
    applicant: Mapped[str] = mapped_column(String(64), index=True)
    department: Mapped[str] = mapped_column(String(64))
    date: Mapped[str] = mapped_column(String(10))
    total: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="submitted", index=True)
    current_node: Mapped[str] = mapped_column(String(64), default="")
    attachment_count: Mapped[int] = mapped_column(Integer, default=0)
    voucher_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_at: Mapped[Optional[Integer]] = mapped_column(Integer, nullable=True)

    items: Mapped[list[ExpenseItem]] = relationship(
        backref="claim", cascade="all, delete-orphan"
    )
