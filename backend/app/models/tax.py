from typing import Optional

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    type: Mapped[str] = mapped_column(String(16))  # purchase / sales
    invoice_no: Mapped[str] = mapped_column(String(64), index=True)
    date: Mapped[str] = mapped_column(String(10))
    period: Mapped[str] = mapped_column(String(7), index=True)
    counterparty: Mapped[str] = mapped_column(String(128))
    tax_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    amount: Mapped[float] = mapped_column(Float)  # 不含税
    tax_rate: Mapped[float] = mapped_column(Float)
    tax_amount: Mapped[float] = mapped_column(Float)
    total_amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="normal")
