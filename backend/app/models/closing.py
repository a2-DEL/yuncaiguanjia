from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CloseRecord(Base):
    __tablename__ = "closings"

    period: Mapped[str] = mapped_column(String(7), primary_key=True)  # YYYY-MM
    carry_forward_voucher_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    carried: Mapped[bool] = mapped_column(Boolean, default=False)
    year_end_voucher_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    year_end_done: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_at: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class OpeningEntry(Base):
    __tablename__ = "opening_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    opening_id: Mapped[str] = mapped_column(String(32), ForeignKey("opening_balances.id", ondelete="CASCADE"), index=True)
    account_code: Mapped[str] = mapped_column(String(32), index=True)
    account_name: Mapped[str] = mapped_column(String(128))
    debit: Mapped[float] = mapped_column(Float, default=0)
    credit: Mapped[float] = mapped_column(Float, default=0)


class OpeningBalance(Base):
    __tablename__ = "opening_balances"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 年份 "2026"
    year: Mapped[int] = mapped_column(Integer, index=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")  # auto / manual / derived
    based_on_period: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    entries: Mapped[list[OpeningEntry]] = relationship(
        backref="opening", cascade="all, delete-orphan"
    )
