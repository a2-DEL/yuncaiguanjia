from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(32))  # office/machine/vehicle/building/other
    spec: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    original_value: Mapped[float] = mapped_column(Float)
    salvage_rate: Mapped[float] = mapped_column(Float, default=0.05)
    useful_life: Mapped[int] = mapped_column(Integer)  # 月
    depreciation_method: Mapped[str] = mapped_column(String(16), default="straight")
    start_date: Mapped[str] = mapped_column(String(10))
    accumulated_depreciation: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(16), default="in_use")


class DepreciationRecord(Base):
    __tablename__ = "depreciations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(32), ForeignKey("assets.id"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)
    amount: Mapped[float] = mapped_column(Float)
    accumulated: Mapped[float] = mapped_column(Float)
