from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models import Account, User
from app.schemas.account import AccountCreate, AccountOut

router = APIRouter(prefix="/accounts", tags=["会计科目"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(select(Account).order_by(Account.code))).scalars().all()
    return [AccountOut.model_validate(r) for r in rows]


@router.post("", response_model=AccountOut)
async def create_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    existing = await db.get(Account, body.code)
    if existing:
        raise HTTPException(status_code=400, detail=f"科目编码 {body.code} 已存在")

    level = 1
    if body.parent_code:
        parent = await db.get(Account, body.parent_code)
        if not parent:
            raise HTTPException(status_code=400, detail=f"上级科目 {body.parent_code} 不存在")
        level = parent.level + 1
        if parent.is_leaf:
            parent.is_leaf = False

    acc = Account(
        code=body.code,
        name=body.name,
        parent_code=body.parent_code,
        level=level,
        type=body.type,
        direction=body.direction,
        is_leaf=True,
        status="active",
        remark=body.remark,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return AccountOut.model_validate(acc)
