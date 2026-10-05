import { db } from '@/db/database'
import type { BankAccount, CashFlow, CashFlowType, VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { saveVoucher } from './voucherService'
import { getAccount } from './accountService'
import { useUserStore } from '@/store/userStore'

export async function listBankAccounts(): Promise<BankAccount[]> {
  return db.bankAccounts.orderBy('name').toArray()
}

export async function createBankAccount(
  data: Omit<BankAccount, 'id' | 'status'> & { status?: BankAccount['status'] },
) {
  const account: BankAccount = { id: uid('ba_'), status: data.status ?? 'active', ...data }
  await db.bankAccounts.add(account)
  await addLog('新增账户', '出纳管理', `新增${data.type === 'bank' ? '银行' : '现金'}账户 ${data.name}`)
  return account
}

export async function updateBankAccount(id: string, patch: Partial<BankAccount>) {
  await db.bankAccounts.update(id, patch)
  await addLog('编辑账户', '出纳管理', `编辑账户 ${patch.name ?? id}`)
}

export async function toggleBankAccount(id: string, disable: boolean) {
  await db.bankAccounts.update(id, { status: disable ? 'disabled' : 'active' })
  await addLog(disable ? '停用账户' : '启用账户', '出纳管理', `${disable ? '停用' : '启用'}账户 ${id}`)
}

/** 与 toggleBankAccount 等价（账户启停） */
export const toggleBankAccountStatus = toggleBankAccount

/** 与 toggleReconcile 等价（资金对账标记） */
export const reconcileCashFlow = toggleReconcile

export interface CashFlowFilter {
  accountId?: string
  type?: CashFlowType
  period?: string
  keyword?: string
  reconciled?: boolean
}

export async function listCashFlows(filter: CashFlowFilter = {}): Promise<CashFlow[]> {
  let list = await db.cashFlows.toArray()
  if (filter.accountId) list = list.filter((f) => f.accountId === filter.accountId || f.relatedAccountId === filter.accountId)
  if (filter.type) list = list.filter((f) => f.type === filter.type)
  if (filter.period) list = list.filter((f) => f.period === filter.period)
  if (filter.reconciled !== undefined) list = list.filter((f) => f.reconciled === filter.reconciled)
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    list = list.filter(
      (f) => f.summary.toLowerCase().includes(kw) || (f.counterparty ?? '').toLowerCase().includes(kw),
    )
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}

export async function createCashFlow(input: {
  date: string
  accountId: string
  type: CashFlowType
  category: string
  counterparty?: string
  amount: number
  summary: string
  relatedAccountId?: string
}): Promise<CashFlow> {
  const cf: CashFlow = {
    id: uid('cf_'),
    period: input.date.slice(0, 7),
    reconciled: false,
    createdAt: Date.now(),
    ...input,
  }
  await db.cashFlows.add(cf)
  await addLog('新增资金流水', '出纳管理', `新增${input.type === 'income' ? '收款' : input.type === 'expense' ? '付款' : '转账'}流水 ${input.summary}`)
  return cf
}

export async function deleteCashFlow(id: string) {
  const f = await db.cashFlows.get(id)
  if (f?.voucherNo) {
    const v = (await db.vouchers.where('voucherNo').equals(f.voucherNo).toArray())[0]
    if (v) await db.vouchers.delete(v.id)
  }
  await db.cashFlows.delete(id)
  await addLog('删除资金流水', '出纳管理', `删除流水 ${id}`)
}

// ===================== 收付款登记（同步生成凭证） =====================
export interface CashFlowInput {
  date: string
  accountId: string // 收款/付款账户（转账时为来源账户）
  type: CashFlowType
  category: string
  amount: number
  summary: string
  counterparty?: string
  relatedAccountId?: string // 转账对方账户（目标）
  offsetAccountCode?: string // 收/付款的对方会计科目（转账时忽略）
}

/** 登记一笔资金收支/转账，并自动生成一张平衡凭证，保证总账一致 */
export async function recordCashFlow(input: CashFlowInput): Promise<CashFlow> {
  const { accountId, type, amount, date, category, summary, counterparty, relatedAccountId, offsetAccountCode } = input
  if (!amount || amount <= 0) throw new Error('金额必须大于 0')
  const acc = await db.bankAccounts.get(accountId)
  if (!acc) throw new Error('资金账户不存在')
  if (acc.status === 'disabled') throw new Error('该账户已停用')
  if (type === 'transfer') {
    if (!relatedAccountId) throw new Error('转账需选择对方账户')
    if (relatedAccountId === accountId) throw new Error('转账来源与对方账户不能相同')
  } else if (!offsetAccountCode) {
    throw new Error('收付款需选择对方会计科目')
  }

  const period = date.slice(0, 7)
  const user = useUserStore.getState().currentUser?.name ?? '系统'
  const cashCode = acc.glAccountCode ?? (acc.type === 'cash' ? '1001' : '100201')
  const cashName = (await getAccount(cashCode))?.name ?? acc.name

  const entries: VoucherEntry[] = []
  if (type === 'income') {
    const off = await getAccount(offsetAccountCode!)
    entries.push({ id: uid('e_'), summary, accountCode: cashCode, accountName: cashName, debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: offsetAccountCode!, accountName: off?.name ?? '', debit: 0, credit: amount })
  } else if (type === 'expense') {
    const off = await getAccount(offsetAccountCode!)
    entries.push({ id: uid('e_'), summary, accountCode: offsetAccountCode!, accountName: off?.name ?? '', debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: cashCode, accountName: cashName, debit: 0, credit: amount })
  } else {
    const target = await db.bankAccounts.get(relatedAccountId!)
    const tCode = target?.glAccountCode ?? '100202'
    const tName = (await getAccount(tCode))?.name ?? target?.name ?? ''
    entries.push({ id: uid('e_'), summary, accountCode: tCode, accountName: tName, debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: cashCode, accountName: cashName, debit: 0, credit: amount })
  }

  const voucher = await saveVoucher({ date, entries, remark: summary, creator: user })

  const flow: CashFlow = {
    id: uid('cf_'),
    date,
    period,
    accountId,
    type,
    category,
    counterparty,
    amount,
    summary,
    relatedAccountId,
    reconciled: false,
    voucherNo: voucher.voucherNo,
    createdAt: Date.now(),
  }
  await db.cashFlows.add(flow)
  await addLog('登记资金流水', '出纳管理', `${type === 'income' ? '收款' : type === 'expense' ? '付款' : '转账'} ${acc.name} ${amount}（凭证 ${voucher.voucherNo}）`)
  return flow
}

export async function toggleReconcile(id: string, reconciled: boolean) {
  await db.cashFlows.update(id, { reconciled })
  await addLog(reconciled ? '对账' : '取消对账', '出纳管理', `${reconciled ? '标记对账' : '取消对账'} ${id}`)
}

/** 账户当前余额 = 期初 + 流水净变动 */
export async function getAccountBalance(accountId: string): Promise<number> {
  const acc = await db.bankAccounts.get(accountId)
  let bal = acc?.initialBalance ?? 0
  const flows = await db.cashFlows.where('accountId').equals(accountId).toArray()
  for (const f of flows) {
    if (f.type === 'income') bal += f.amount
    else bal -= f.amount
  }
  const inflow = await db.cashFlows.filter((f) => f.relatedAccountId === accountId).toArray()
  for (const f of inflow) bal += f.amount
  return bal
}

export interface AccountSummary {
  account: BankAccount
  balance: number
  income: number
  expense: number
}

export async function getAccountSummary(): Promise<AccountSummary[]> {
  const accounts = await listBankAccounts()
  const result: AccountSummary[] = []
  for (const account of accounts) {
    const flows = await db.cashFlows.where('accountId').equals(account.id).toArray()
    let income = 0
    let expense = 0
    for (const f of flows) {
      if (f.type === 'income') income += f.amount
      else if (f.type === 'expense') expense += f.amount
    }
    const balance = await getAccountBalance(account.id)
    result.push({ account, balance, income, expense })
  }
  return result
}

export interface JournalEntry {
  date: string
  type?: CashFlowType
  summary: string
  counterparty?: string
  debit: number
  credit: number
  balance: number
}

/** 生成某账户日记账（含期初、借贷方向与累计余额） */
export async function getJournal(accountId: string): Promise<{ initialBalance: number; entries: JournalEntry[] }> {
  const acc = await db.bankAccounts.get(accountId)
  const initial = acc?.initialBalance ?? 0
  const flows = await db.cashFlows.filter(
    (f) => f.accountId === accountId || f.relatedAccountId === accountId,
  ).toArray()
  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  let running = initial
  const entries: JournalEntry[] = flows.map((f) => {
    let debit = 0
    let credit = 0
    if (f.accountId === accountId) {
      if (f.type === 'income') {
        debit = f.amount
        running += f.amount
      } else {
        credit = f.amount
        running -= f.amount
      }
    } else {
      debit = f.amount
      running += f.amount
    }
    return { date: f.date, type: f.type, summary: f.summary, counterparty: f.counterparty, debit, credit, balance: running }
  })
  return { initialBalance: initial, entries }
}
