from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    type: Mapped[str] = mapped_column(String(16))  # customer / supplier
    code: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    tax_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    credit_limit: Mapped[float] = mapped_column(Float, default=0)


class ArApBill(Base):
    __tablename__ = "ar_ap_bills"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    direction: Mapped[str] = mapped_column(String(16))  # receivable / payable
    contact_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), index=True)
    bill_no: Mapped[str] = mapped_column(String(32), index=True)
    date: Mapped[str] = mapped_column(String(10))
    due_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    settled: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(16), default="open")
    subject: Mapped[str] = mapped_column(String(256))
    voucher_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    closed_at: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
