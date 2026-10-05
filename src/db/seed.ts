import { db } from './database'
import type {
  Account, AccountType, Role, User, OperationLog, Voucher, VoucherEntry,
  BankAccount, CashFlow, Contact, ArApBill, Asset, ExpenseClaim, Invoice, ExchangeRate,
} from '@/types/models'
import { ensureRolePermissions } from '@/services/permissionService'

interface SeedNode {
  code: string
  name: string
  type: AccountType
  direction: 'debit' | 'credit'
  currency?: string
  children?: SeedNode[]
}

// 企业会计准则（小企业）核心科目树
const ACCOUNT_TREE: SeedNode[] = [
  { code: '1001', name: '库存现金', type: 'asset', direction: 'debit', children: [
    { code: '100101', name: '人民币', type: 'asset', direction: 'debit' },
  ] },
  { code: '1002', name: '银行存款', type: 'asset', direction: 'debit', children: [
    { code: '100201', name: '中国工商银行', type: 'asset', direction: 'debit' },
    { code: '100202', name: '招商银行', type: 'asset', direction: 'debit' },
    { code: '100203', name: '美元户', type: 'asset', direction: 'debit', currency: 'USD' },
  ] },
  { code: '1122', name: '应收账款', type: 'asset', direction: 'debit', children: [
    { code: '112201', name: '客户-宏远科技', type: 'asset', direction: 'debit' },
    { code: '112202', name: '客户-星河贸易', type: 'asset', direction: 'debit' },
  ] },
  { code: '1123', name: '预付账款', type: 'asset', direction: 'debit' },
  { code: '1231', name: '其他应收款', type: 'asset', direction: 'debit' },
  { code: '1601', name: '固定资产', type: 'asset', direction: 'debit' },
  { code: '1602', name: '累计折旧', type: 'asset', direction: 'credit' },
  { code: '1701', name: '无形资产', type: 'asset', direction: 'debit' },
  { code: '2001', name: '短期借款', type: 'liability', direction: 'credit' },
  { code: '2202', name: '应付账款', type: 'liability', direction: 'credit', children: [
    { code: '220201', name: '供应商-鼎盛物资', type: 'liability', direction: 'credit' },
  ] },
  { code: '2203', name: '预收账款', type: 'liability', direction: 'credit' },
  { code: '2211', name: '应付职工薪酬', type: 'liability', direction: 'credit' },
  { code: '2221', name: '应交税费', type: 'liability', direction: 'credit' },
  { code: '2241', name: '其他应付款', type: 'liability', direction: 'credit' },
  { code: '3001', name: '实收资本', type: 'equity', direction: 'credit' },
  { code: '3103', name: '本年利润', type: 'equity', direction: 'credit' },
  { code: '3104', name: '利润分配', type: 'equity', direction: 'credit' },
  { code: '5001', name: '生产成本', type: 'cost', direction: 'debit' },
  { code: '5301', name: '研发支出', type: 'cost', direction: 'debit' },
  { code: '6001', name: '主营业务收入', type: 'profit', direction: 'credit', children: [
    { code: '600101', name: '产品销售收入', type: 'profit', direction: 'credit' },
  ] },
  { code: '6051', name: '其他业务收入', type: 'profit', direction: 'credit' },
  { code: '6401', name: '主营业务成本', type: 'profit', direction: 'debit' },
  { code: '6402', name: '其他业务成本', type: 'profit', direction: 'debit' },
  { code: '6601', name: '销售费用', type: 'profit', direction: 'debit' },
  { code: '6602', name: '管理费用', type: 'profit', direction: 'debit', children: [
    { code: '660201', name: '办公费', type: 'profit', direction: 'debit' },
    { code: '660202', name: '差旅费', type: 'profit', direction: 'debit' },
    { code: '660203', name: '工资薪金', type: 'profit', direction: 'debit' },
  ] },
  { code: '6603', name: '财务费用', type: 'profit', direction: 'debit', children: [
    { code: '660301', name: '利息收入', type: 'profit', direction: 'debit' },
    { code: '660302', name: '手续费', type: 'profit', direction: 'debit' },
  ] },
  { code: '6711', name: '营业外支出', type: 'profit', direction: 'debit' },
  { code: '6801', name: '所得税费用', type: 'profit', direction: 'debit' },
]

function flatten(nodes: SeedNode[], parentCode: string | null, level: number, out: Account[]) {
  for (const n of nodes) {
    const isLeaf = !n.children || n.children.length === 0
    out.push({
      id: n.code,
      code: n.code,
      name: n.name,
      parentCode,
      level,
      type: n.type,
      direction: n.direction,
      isLeaf,
      status: 'active',
      currency: n.currency,
    })
    if (n.children) flatten(n.children, n.code, level + 1, out)
  }
}

function entry(summary: string, code: string, name: string, debit = 0, credit = 0): VoucherEntry {
  return { id: `e${Math.random().toString(36).slice(2, 9)}`, summary, accountCode: code, accountName: name, debit, credit }
}

function buildVoucher(
  no: string, date: string, status: Voucher['status'], creator: string, entries: VoucherEntry[],
): Voucher {
  return {
    id: `v${no}`,
    voucherNo: no,
    date,
    period: date.slice(0, 7),
    entries,
    status,
    attachments: [],
    creator,
    createdAt: new Date(date).getTime(),
    auditedAt: status === 'audited' ? new Date(date).getTime() : undefined,
    auditor: status === 'audited' ? '张总监' : undefined,
  }
}

const DEMO_VOUCHERS: Voucher[] = [
  buildVoucher('记-2026-07-0001', '2026-07-05', 'audited', '李会计', [
    entry('收回宏远科技货款', '100201', '中国工商银行', 100000, 0),
    entry('收回宏远科技货款', '112201', '客户-宏远科技', 0, 100000),
  ]),
  buildVoucher('记-2026-07-0002', '2026-07-12', 'audited', '李会计', [
    entry('购入办公电脑设备', '1601', '固定资产', 50000, 0),
    entry('购入办公电脑设备', '100201', '中国工商银行', 0, 50000),
  ]),
  buildVoucher('记-2026-07-0003', '2026-07-20', 'audited', '李会计', [
    entry('计提当月工资', '660203', '工资薪金', 30000, 0),
    entry('计提当月工资', '2211', '应付职工薪酬', 0, 30000),
  ]),
  buildVoucher('记-2026-07-0004', '2026-07-31', 'audited', '李会计', [
    entry('收到产品销售收入', '100201', '中国工商银行', 200000, 0),
    entry('确认产品销售收入', '6001', '主营业务收入', 0, 200000),
  ]),
  buildVoucher('记-2026-08-0001', '2026-08-10', 'audited', '李会计', [
    entry('支付办公室房租', '660201', '办公费', 12000, 0),
    entry('支付办公室房租', '100202', '招商银行', 0, 12000),
  ]),
  buildVoucher('记-2026-08-0002', '2026-08-15', 'audited', '李会计', [
    entry('收到产品销售收入', '100201', '中国工商银行', 150000, 0),
    entry('确认产品销售收入', '600101', '产品销售收入', 0, 150000),
  ]),
  buildVoucher('记-2026-08-0003', '2026-08-25', 'audited', '李会计', [
    entry('报销差旅费', '660202', '差旅费', 8000, 0),
    entry('报销差旅费', '1001', '库存现金', 0, 8000),
  ]),
  buildVoucher('记-2026-09-0001', '2026-09-05', 'audited', '李会计', [
    entry('赊销给星河贸易', '112202', '客户-星河贸易', 180000, 0),
    entry('确认产品销售收入', '6001', '主营业务收入', 0, 180000),
  ]),
  buildVoucher('记-2026-09-0002', '2026-09-18', 'audited', '李会计', [
    entry('支付鼎盛物资货款', '220201', '供应商-鼎盛物资', 90000, 0),
    entry('支付鼎盛物资货款', '100201', '中国工商银行', 0, 90000),
  ]),
  buildVoucher('记-2026-09-0003', '2026-09-28', 'audited', '李会计', [
    entry('银行手续费', '660302', '手续费', 500, 0),
    entry('银行手续费', '100201', '中国工商银行', 0, 500),
  ]),
  buildVoucher('记-2026-10-0001', '2026-10-03', 'audited', '李会计', [
    entry('收到产品销售收入', '100201', '中国工商银行', 220000, 0),
    entry('确认产品销售收入', '6001', '主营业务收入', 0, 220000),
  ]),
  buildVoucher('记-2026-10-0002', '2026-10-08', 'pending', '李会计', [
    entry('购买办公用品', '660201', '办公费', 6000, 0),
    entry('购买办公用品', '1001', '库存现金', 0, 6000),
  ]),
  buildVoucher('记-2026-10-0003', '2026-10-10', 'draft', '李会计', [
    entry('支付推广费用', '6601', '销售费用', 15000, 0),
    entry('支付推广费用', '100202', '招商银行', 0, 15000),
  ]),
]

const ROLES: Role[] = [
  { key: 'admin', name: '超级管理员', permissions: ['*'] },
  { key: 'finance_manager', name: '财务主管', permissions: ['voucher:create', 'voucher:edit', 'voucher:audit', 'voucher:delete', 'voucher:export', 'account:manage', 'report:view', 'cash:manage', 'contact:manage', 'asset:manage', 'expense:manage', 'tax:manage'] },
  { key: 'accountant', name: '会计', permissions: ['voucher:create', 'voucher:edit', 'voucher:audit', 'voucher:export', 'account:view', 'report:view'] },
  { key: 'cashier', name: '出纳', permissions: ['voucher:create', 'voucher:view', 'cash:manage', 'report:view'] },
  { key: 'employee', name: '普通员工', permissions: ['expense:create', 'voucher:view'] },
]

const USERS: User[] = [
  { id: 'u1', name: '张明', username: 'admin', role: 'admin', avatarColor: '#1B5FE3' },
  { id: 'u2', name: '李静', username: 'accountant', role: 'accountant', avatarColor: '#0E9F6E' },
  { id: 'u3', name: '王芳', username: 'cashier', role: 'cashier', avatarColor: '#FAAD14' },
]

const LOGS: OperationLog[] = [
  { id: 'l1', action: '初始化', module: '系统', detail: '系统初始化并载入演示数据', userId: 'u1', userName: '张明', time: Date.now() - 86400000 },
  { id: 'l2', action: '审核凭证', module: '凭证管理', detail: '审核 记-2026-10-0001', userId: 'u1', userName: '张明', time: Date.now() - 3600000 },
]

// ===================== 演示：出纳账户与流水 =====================
const BANK_ACCOUNTS: BankAccount[] = [
  { id: 'ba1', name: '中国工商银行', type: 'bank', bankName: '中国工商银行上海分行', accountNo: '6222 **** **** 8841', currency: 'CNY', initialBalance: 300000, glAccountCode: '100201', status: 'active' },
  { id: 'ba2', name: '招商银行', type: 'bank', bankName: '招商银行深圳分行', accountNo: '6214 **** **** 2290', currency: 'CNY', initialBalance: 80000, glAccountCode: '100202', status: 'active' },
  { id: 'ba3', name: '库存现金', type: 'cash', currency: 'CNY', initialBalance: 20000, glAccountCode: '1001', status: 'active' },
]

const CASH_FLOWS: CashFlow[] = [
  { id: 'cf1', date: '2026-10-03', period: '2026-10', accountId: 'ba1', type: 'income', category: '销售收入', counterparty: '星河贸易', amount: 220000, summary: '收到货款', reconciled: true, voucherNo: '记-2026-10-0001', createdAt: Date.now() },
  { id: 'cf2', date: '2026-10-10', period: '2026-10', accountId: 'ba3', type: 'expense', category: '办公费', counterparty: '文具供应商', amount: 6000, summary: '购买办公用品', reconciled: false, voucherNo: '记-2026-10-0002', createdAt: Date.now() },
  { id: 'cf3', date: '2026-10-12', period: '2026-10', accountId: 'ba2', type: 'expense', category: '推广费', counterparty: '广告公司', amount: 15000, summary: '支付推广费用', reconciled: false, voucherNo: '记-2026-10-0003', createdAt: Date.now() },
  { id: 'cf4', date: '2026-10-15', period: '2026-10', accountId: 'ba1', type: 'transfer', category: '内部转账', counterparty: '招商银行', amount: 50000, summary: '工行转招行', relatedAccountId: 'ba2', reconciled: true, createdAt: Date.now() },
  { id: 'cf5', date: '2026-09-28', period: '2026-09', accountId: 'ba1', type: 'expense', category: '手续费', counterparty: '工商银行', amount: 500, summary: '银行手续费', reconciled: true, voucherNo: '记-2026-09-0003', createdAt: Date.now() },
  { id: 'cf6', date: '2026-09-05', period: '2026-09', accountId: 'ba1', type: 'income', category: '销售收入', counterparty: '星河贸易', amount: 180000, summary: '赊销回款', reconciled: true, voucherNo: '记-2026-09-0001', createdAt: Date.now() },
]

// ===================== 演示：往来客户/供应商与单据 =====================
const CONTACTS: Contact[] = [
  { id: 'c1', type: 'customer', name: '宏远科技有限公司', code: 'C0001', phone: '13800000001', taxNo: '91310000MA1FL0XX', address: '上海市浦东新区', creditLimit: 500000 },
  { id: 'c2', type: 'customer', name: '星河贸易有限公司', code: 'C0002', phone: '13800000002', taxNo: '91310000MA1FL0YY', address: '深圳市南山区', creditLimit: 300000 },
  { id: 's1', type: 'supplier', name: '鼎盛物资供应公司', code: 'S0001', phone: '13900000003', taxNo: '91310000MA1FL0ZZ', address: '广州市天河区', creditLimit: 200000 },
]

const ARAP_BILLS: ArApBill[] = [
  { id: 'b1', direction: 'receivable', contactId: 'c2', billNo: 'AR2026-0001', date: '2026-09-05', dueDate: '2026-12-05', amount: 180000, settled: 180000, status: 'closed', subject: '赊销产品', voucherNo: '记-2026-09-0001', createdAt: Date.now(), closedAt: Date.now() },
  { id: 'b2', direction: 'receivable', contactId: 'c1', billNo: 'AR2026-0002', date: '2026-07-05', dueDate: '2026-10-05', amount: 100000, settled: 100000, status: 'closed', subject: '销售货款', voucherNo: '记-2026-07-0001', createdAt: Date.now(), closedAt: Date.now() },
  { id: 'b3', direction: 'receivable', contactId: 'c2', billNo: 'AR2026-0003', date: '2026-10-01', dueDate: '2026-11-30', amount: 120000, settled: 40000, status: 'partial', subject: '本期新增应收', createdAt: Date.now() },
  { id: 'b4', direction: 'payable', contactId: 's1', billNo: 'AP2026-0001', date: '2026-09-18', dueDate: '2026-10-18', amount: 90000, settled: 90000, status: 'closed', subject: '采购物资', voucherNo: '记-2026-09-0002', createdAt: Date.now(), closedAt: Date.now() },
  { id: 'b5', direction: 'payable', contactId: 's1', billNo: 'AP2026-0002', date: '2026-10-02', dueDate: '2026-11-02', amount: 60000, settled: 0, status: 'open', subject: '本期新增应付', createdAt: Date.now() },
]

// ===================== 演示：固定资产 =====================
const ASSETS: Asset[] = [
  { id: 'a1', code: 'GD-0001', name: '办公电脑（台式）', category: 'office', spec: '联想 ThinkCentre', department: '财务部', user: '李静', originalValue: 50000, salvageRate: 0.05, usefulLife: 36, depreciationMethod: 'straight', startDate: '2026-07-12', accumulatedDepreciation: 4330, status: 'in_use' },
  { id: 'a2', code: 'GD-0002', name: '商务轿车', category: 'vehicle', spec: '大众帕萨特', department: '总经办', user: '张明', originalValue: 180000, salvageRate: 0.05, usefulLife: 60, depreciationMethod: 'straight', startDate: '2026-01-01', accumulatedDepreciation: 28500, status: 'in_use' },
  { id: 'a3', code: 'GD-0003', name: '生产机床', category: 'machine', spec: 'CNC-2000', department: '生产部', user: '车间', originalValue: 320000, salvageRate: 0.05, usefulLife: 120, depreciationMethod: 'straight', startDate: '2025-06-01', accumulatedDepreciation: 45600, status: 'in_use' },
]

// ===================== 演示：费用报销 =====================
const EXPENSE_CLAIMS: ExpenseClaim[] = [
  { id: 'ec1', claimNo: 'BX2026-0001', applicant: '李静', department: '财务部', date: '2026-08-25', items: [{ id: 'ei1', category: '差旅费', summary: '上海出差高铁住宿', amount: 8000, accountCode: '660202' }], total: 8000, status: 'paid', currentNode: '已完成', attachmentCount: 2, remark: '出差报销', createdAt: Date.now(), approvedAt: Date.now() },
  { id: 'ec2', claimNo: 'BX2026-0002', applicant: '王芳', department: '销售部', date: '2026-10-09', items: [{ id: 'ei2', category: '招待费', summary: '客户商务宴请', amount: 3500, accountCode: '6601' }, { id: 'ei3', category: '差旅费', summary: '北京出差机票', amount: 2200, accountCode: '660202' }], total: 5700, status: 'submitted', currentNode: '部门经理审批', attachmentCount: 3, createdAt: Date.now() },
  { id: 'ec3', claimNo: 'BX2026-0003', applicant: '赵磊', department: '行政部', date: '2026-10-11', items: [{ id: 'ei4', category: '办公费', summary: '购买办公耗材', amount: 1200, accountCode: '660201' }], total: 1200, status: 'approved', currentNode: '财务复核', attachmentCount: 1, createdAt: Date.now(), approvedAt: Date.now() },
]

// ===================== 演示：税务发票 =====================
const INVOICES: Invoice[] = [
  { id: 'iv1', type: 'sales', invoiceNo: '4413200000001', date: '2026-10-03', period: '2026-10', counterparty: '星河贸易有限公司', taxNo: '91310000MA1FL0YY', amount: 220000, taxRate: 0.13, taxAmount: 28600, totalAmount: 248600, status: 'normal' },
  { id: 'iv2', type: 'sales', invoiceNo: '4413200000002', date: '2026-09-05', period: '2026-09', counterparty: '宏远科技有限公司', taxNo: '91310000MA1FL0XX', amount: 180000, taxRate: 0.13, taxAmount: 23400, totalAmount: 203400, status: 'normal' },
  { id: 'iv3', type: 'purchase', invoiceNo: '4413200000099', date: '2026-09-18', period: '2026-09', counterparty: '鼎盛物资供应公司', taxNo: '91310000MA1FL0ZZ', amount: 90000, taxRate: 0.13, taxAmount: 11700, totalAmount: 101700, status: 'normal' },
  { id: 'iv4', type: 'purchase', invoiceNo: '4413200000100', date: '2026-10-02', period: '2026-10', counterparty: '鼎盛物资供应公司', taxNo: '91310000MA1FL0ZZ', amount: 60000, taxRate: 0.13, taxAmount: 7800, totalAmount: 67800, status: 'normal' },
]

/** 幂等种子：仅当数据表为空时注入 */
// ===================== 演示：汇率表 =====================
const EXCHANGE_RATES: ExchangeRate[] = [
  { id: 'er1', currency: 'USD', date: '2026-01-01', rate: 7.18, remark: '2026年初基准汇率' },
  { id: 'er2', currency: 'EUR', date: '2026-01-01', rate: 7.85 },
  { id: 'er3', currency: 'HKD', date: '2026-01-01', rate: 0.92 },
  { id: 'er4', currency: 'JPY', date: '2026-01-01', rate: 0.048 },
  { id: 'er5', currency: 'GBP', date: '2026-01-01', rate: 9.1 },
]

export async function seedIfEmpty() {
  const accountCount = await db.accounts.count()
  if (accountCount === 0) {
    const accounts: Account[] = []
    flatten(ACCOUNT_TREE, null, 1, accounts)
    await db.accounts.bulkAdd(accounts)
  }
  if ((await db.exchangeRates.count()) === 0) {
    await db.exchangeRates.bulkAdd(EXCHANGE_RATES)
  }
  if ((await db.vouchers.count()) === 0) {
    await db.vouchers.bulkAdd(DEMO_VOUCHERS)
  }
  if ((await db.roles.count()) === 0) {
    await db.roles.bulkAdd(ROLES)
  }
  // 并集补齐权限点（不覆盖用户编辑），保证新权限在新旧库都能生效
  await ensureRolePermissions()
  if ((await db.users.count()) === 0) {
    await db.users.bulkAdd(USERS)
  }
  if ((await db.logs.count()) === 0) {
    await db.logs.bulkAdd(LOGS)
  }
  if ((await db.bankAccounts.count()) === 0) {
    await db.bankAccounts.bulkAdd(BANK_ACCOUNTS)
  }
  if ((await db.cashFlows.count()) === 0) {
    await db.cashFlows.bulkAdd(CASH_FLOWS)
  }
  if ((await db.contacts.count()) === 0) {
    await db.contacts.bulkAdd(CONTACTS)
  }
  if ((await db.arApBills.count()) === 0) {
    await db.arApBills.bulkAdd(ARAP_BILLS)
  }
  if ((await db.assets.count()) === 0) {
    await db.assets.bulkAdd(ASSETS)
  }
  if ((await db.expenseClaims.count()) === 0) {
    await db.expenseClaims.bulkAdd(EXPENSE_CLAIMS)
  }
  if ((await db.invoices.count()) === 0) {
    await db.invoices.bulkAdd(INVOICES)
  }
}
