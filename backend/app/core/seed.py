"""首次启动时的幂等种子数据：角色、管理员、科目树。"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import hash_password
from app.models import Account, Role, User


def _uid(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


# 与前端 seed.ts 对齐的企业会计准则科目树
ACCOUNT_TREE: list[dict] = [
    # 资产
    {"code": "1001", "name": "库存现金", "type": "asset", "direction": "debit", "children": [
        {"code": "100101", "name": "人民币", "type": "asset", "direction": "debit"},
    ]},
    {"code": "1002", "name": "银行存款", "type": "asset", "direction": "debit", "children": [
        {"code": "100201", "name": "中国工商银行", "type": "asset", "direction": "debit"},
        {"code": "100202", "name": "招商银行", "type": "asset", "direction": "debit"},
    ]},
    {"code": "1122", "name": "应收账款", "type": "asset", "direction": "debit", "children": [
        {"code": "112201", "name": "客户-宏远科技", "type": "asset", "direction": "debit"},
        {"code": "112202", "name": "客户-星河贸易", "type": "asset", "direction": "debit"},
    ]},
    {"code": "1123", "name": "预付账款", "type": "asset", "direction": "debit"},
    {"code": "1231", "name": "其他应收款", "type": "asset", "direction": "debit"},
    {"code": "1601", "name": "固定资产", "type": "asset", "direction": "debit"},
    {"code": "1602", "name": "累计折旧", "type": "asset", "direction": "credit"},
    {"code": "1701", "name": "无形资产", "type": "asset", "direction": "debit"},
    # 负债
    {"code": "2001", "name": "短期借款", "type": "liability", "direction": "credit"},
    {"code": "2202", "name": "应付账款", "type": "liability", "direction": "credit", "children": [
        {"code": "220201", "name": "供应商-鼎盛物资", "type": "liability", "direction": "credit"},
    ]},
    {"code": "2203", "name": "预收账款", "type": "liability", "direction": "credit"},
    {"code": "2211", "name": "应付职工薪酬", "type": "liability", "direction": "credit"},
    {"code": "2221", "name": "应交税费", "type": "liability", "direction": "credit"},
    {"code": "2241", "name": "其他应付款", "type": "liability", "direction": "credit"},
    # 权益
    {"code": "3001", "name": "实收资本", "type": "equity", "direction": "credit"},
    {"code": "3103", "name": "本年利润", "type": "equity", "direction": "credit"},
    {"code": "3104", "name": "利润分配", "type": "equity", "direction": "credit"},
    # 成本
    {"code": "5001", "name": "生产成本", "type": "cost", "direction": "debit"},
    {"code": "5301", "name": "研发支出", "type": "cost", "direction": "debit"},
    # 损益
    {"code": "6001", "name": "主营业务收入", "type": "profit", "direction": "credit", "children": [
        {"code": "600101", "name": "产品销售收入", "type": "profit", "direction": "credit"},
    ]},
    {"code": "6051", "name": "其他业务收入", "type": "profit", "direction": "credit"},
    {"code": "6401", "name": "主营业务成本", "type": "profit", "direction": "debit"},
    {"code": "6402", "name": "其他业务成本", "type": "profit", "direction": "debit"},
    {"code": "6601", "name": "销售费用", "type": "profit", "direction": "debit"},
    {"code": "6602", "name": "管理费用", "type": "profit", "direction": "debit", "children": [
        {"code": "660201", "name": "办公费", "type": "profit", "direction": "debit"},
        {"code": "660202", "name": "差旅费", "type": "profit", "direction": "debit"},
        {"code": "660203", "name": "工资薪金", "type": "profit", "direction": "debit"},
    ]},
    {"code": "6603", "name": "财务费用", "type": "profit", "direction": "debit", "children": [
        {"code": "660301", "name": "利息收入", "type": "profit", "direction": "debit"},
        {"code": "660302", "name": "手续费", "type": "profit", "direction": "debit"},
    ]},
    {"code": "6711", "name": "营业外支出", "type": "profit", "direction": "debit"},
    {"code": "6801", "name": "所得税费用", "type": "profit", "direction": "debit"},
]


ROLES = [
    Role(key="admin", name="超级管理员", permissions=["*"]),
    Role(key="finance_manager", name="财务主管", permissions=[
        "voucher:create", "voucher:edit", "voucher:audit", "voucher:delete",
        "account:manage", "report:view", "cash:manage", "contact:manage",
    ]),
    Role(key="accountant", name="会计", permissions=[
        "voucher:create", "voucher:edit", "voucher:audit", "voucher:export",
        "account:view", "report:view",
    ]),
    Role(key="cashier", name="出纳", permissions=[
        "voucher:create", "voucher:view", "cash:manage", "report:view",
    ]),
    Role(key="employee", name="普通员工", permissions=["expense:create", "voucher:view"]),
]


def _flatten_accounts(nodes: list[dict], parent_code: str | None, level: int, out: list[Account]):
    for n in nodes:
        is_leaf = not n.get("children")
        out.append(Account(
            code=n["code"], name=n["name"], parent_code=parent_code,
            level=level, type=n["type"], direction=n["direction"],
            is_leaf=is_leaf, status="active",
        ))
        if n.get("children"):
            _flatten_accounts(n["children"], n["code"], level + 1, out)


async def seed_if_empty(db: AsyncSession) -> None:
    # 角色
    existing_role = (await db.execute(select(Role).limit(1))).scalar_one_or_none()
    if not existing_role:
        db.add_all(ROLES)

    # 管理员
    existing_admin = (await db.execute(select(User).where(User.username == settings.FIRST_ADMIN_USERNAME))).scalar_one_or_none()
    if not existing_admin:
        db.add(User(
            id=_uid("u_"),
            username=settings.FIRST_ADMIN_USERNAME,
            password_hash=hash_password(settings.FIRST_ADMIN_PASSWORD),
            name=settings.FIRST_ADMIN_NAME,
            role="admin",
            avatar_color="#1B5FE3",
            is_active=True,
        ))

    # 科目树
    existing_acc = (await db.execute(select(Account).limit(1))).scalar_one_or_none()
    if not existing_acc:
        accounts: list[Account] = []
        _flatten_accounts(ACCOUNT_TREE, None, 1, accounts)
        db.add_all(accounts)

    await db.commit()
