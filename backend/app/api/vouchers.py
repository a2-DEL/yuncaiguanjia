import time
import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models import Account, OperationLog, User, Voucher, VoucherEntry
from app.schemas.voucher import VoucherCreate, VoucherOut, VoucherEntryOut

router = APIRouter(prefix="/vouchers", tags=["凭证"])


def _uid(prefix: str = "v_") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


async def _next_voucher_no(db: AsyncSession, period: str) -> str:
    prefix = f"记-{period}-"
    # 取当前期间最大序号
    rows = (await db.execute(
        select(Voucher.voucher_no).where(Voucher.period == period)
    )).scalars().all()
    max_no = 0
    for no in rows:
        try:
            num = int(no.replace(prefix, ""))
            max_no = max(max_no, num)
        except ValueError:
            continue
    return f"{prefix}{max_no + 1:04d}"


def _validate_balance(entries: list) -> None:
    debit = sum(e.debit for e in entries)
    credit = sum(e.credit for e in entries)
    if abs(debit - credit) > 0.005:
        raise HTTPException(status_code=400, detail=f"借贷不平衡：借方 {debit:.2f} / 贷方 {credit:.2f}")


async def _validate_accounts(db: AsyncSession, entries: list) -> None:
    codes = {e.account_code for e in entries}
    for code in codes:
        acc = await db.get(Account, code)
        if not acc:
            raise HTTPException(status_code=400, detail=f"科目 {code} 不存在")
        if not acc.is_leaf:
            raise HTTPException(status_code=400, detail=f"科目 {code} 不是末级科目，不能直接分录")


@router.get("", response_model=list[VoucherOut])
async def list_vouchers(
    period: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Voucher).order_by(Voucher.date.desc(), Voucher.voucher_no.desc())
    if period:
        q = q.where(Voucher.period == period)
    if status:
        q = q.where(Voucher.status == status)
    vouchers = (await db.execute(q)).scalars().all()

    result = []
    for v in vouchers:
        await db.refresh(v, attribute_names=["entries"])
        result.append(VoucherOut.model_validate(v))
    return result


@router.post("", response_model=VoucherOut, status_code=201)
async def create_voucher(
    body: VoucherCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    _validate_balance(body.entries)
    await _validate_accounts(db, body.entries)

    period = body.date.strftime("%Y-%m")
    voucher_no = await _next_voucher_no(db, period)

    v = Voucher(
        id=_uid(),
        voucher_no=voucher_no,
        date=body.date,
        period=period,
        status="draft",
        creator=current.name,
        remark=body.remark,
    )
    db.add(v)
    await db.flush()

    for e in body.entries:
        db.add(VoucherEntry(
            id=_uid("e_"),
            voucher_id=v.id,
            summary=e.summary,
            account_code=e.account_code,
            account_name=e.account_name,
            debit=e.debit,
            credit=e.credit,
        ))

    db.add(OperationLog(
        id=_uid("l_"), action="新增凭证", module="凭证管理",
        detail=f"新增凭证 {voucher_no}", user_id=current.id, user_name=current.name,
    ))
    await db.commit()
    await db.refresh(v, attribute_names=["entries"])
    return VoucherOut.model_validate(v)


@router.post("/{voucher_id}/audit", response_model=VoucherOut)
async def audit_voucher(
    voucher_id: str,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="凭证不存在")
    if v.status != "draft":
        raise HTTPException(status_code=400, detail=f"当前状态为 {v.status}，不能审核")
    v.status = "audited"
    v.auditor = current.name
    v.audited_at = date_type.today()
    await db.commit()
    await db.refresh(v, attribute_names=["entries"])
    return VoucherOut.model_validate(v)
