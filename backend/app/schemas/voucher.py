from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class VoucherEntryIn(BaseModel):
    summary: str
    account_code: str
    account_name: str
    debit: float = 0
    credit: float = 0


class VoucherEntryOut(VoucherEntryIn):
    id: str

    model_config = {"from_attributes": True}


class VoucherCreate(BaseModel):
    date: date
    remark: Optional[str] = None
    entries: list[VoucherEntryIn] = Field(..., min_length=2)


class VoucherOut(BaseModel):
    id: str
    voucher_no: str
    date: date
    period: str
    status: str
    creator: str
    auditor: Optional[str] = None
    remark: Optional[str] = None
    entries: list[VoucherEntryOut] = []

    model_config = {"from_attributes": True}
