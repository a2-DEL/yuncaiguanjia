import { db } from '@/db/database'
import { listAccounts } from './accountService'
import { currentPeriod } from '@/utils/format'
import dayjs from 'dayjs'
import type { Account } from '@/types/models'

const INCOME_PREFIX = ['6001', '6051']
const CASH_PREFIX = ['1001', '1002']
const RECEIVABLE_PREFIX = ['1122']
const PAYABLE_PREFIX = ['2202']

function expenseCategory(code: string): string | null {
  if (code.startsWith('6401') || code.startsWith('6402')) return '营业成本'
  if (code.startsWith('6601')) return '销售费用'
  if (code.startsWith('6602')) return '管理费用'
  if (code.startsWith('6603')) return '财务费用'
  if (code.startsWith('6711')) return '营业外支出'
  if (code.startsWith('6801')) return '所得税费用'
  return null
}

function isIncome(code: string): boolean {
  return INCOME_PREFIX.some((p) => code.startsWith(p))
}
function startsAny(code: string, prefixes: string[]): boolean {
  return prefixes.some((p) => code.startsWith(p))
}

interface Agg {
  debit: number
  credit: number
}
type AggMap = Map<string, Agg>

function addTo(m: AggMap, code: string, d: number, c: number) {
  const x = m.get(code) || { debit: 0, credit: 0 }
  x.debit += d
  x.credit += c
  m.set(code, x)
}

async function loadAggregates() {
  const vouchers = (await db.vouchers.toArray()).filter((v) => v.status !== 'void')
  const accounts = await listAccounts()
  const dirMap = new Map<string, 'debit' | 'credit'>()
  accounts.forEach((a: Account) => dirMap.set(a.code, a.direction))

  const periodIndex = new Map<string, AggMap>()
  const total = new Map<string, Agg>() as AggMap
  for (const v of vouchers) {
    let pm = periodIndex.get(v.period)
    if (!pm) {
      pm = new Map()
      periodIndex.set(v.period, pm)
    }
    for (const e of v.entries) {
      addTo(pm, e.accountCode, e.debit, e.credit)
      addTo(total, e.accountCode, e.debit, e.credit)
    }
  }
  return { periodIndex, total, dirMap }
}

function balanceOf(code: string, m: AggMap, dirMap: Map<string, 'debit' | 'credit'>): number {
  const a = m.get(code)
  if (!a) return 0
  const dir = dirMap.get(code)
  return dir === 'credit' ? a.credit - a.debit : a.debit - a.credit
}

function sumPrefixBalance(m: AggMap, prefixes: string[], dirMap: Map<string, 'debit' | 'credit'>): number {
  let s = 0
  for (const [code, _] of m) {
    if (startsAny(code, prefixes)) s += balanceOf(code, m, dirMap)
  }
  return s
}

function sumIncomeCredit(m: AggMap): number {
  let s = 0
  for (const [code, a] of m) if (isIncome(code)) s += a.credit
  return s
}
function sumExpenseDebit(m: AggMap): number {
  let s = 0
  for (const [code, a] of m) if (expenseCategory(code)) s += a.debit
  return s
}

function lastMonths(n: number): string[] {
  const arr: string[] = []
  const now = dayjs()
  for (let i = n - 1; i >= 0; i--) arr.push(now.subtract(i, 'month').format('YYYY-MM'))
  return arr
}

export interface DashboardSummary {
  period: string
  revenue: number
  expense: number
  profit: number
  receivable: number
  payable: number
  accountBalance: number
  unauditedCount: number
  voucherCount: number
  pendingCount: number
  draftCount: number
}

export async function getDashboard(period: string = currentPeriod()): Promise<DashboardSummary> {
  const { periodIndex, total, dirMap } = await loadAggregates()
  const pm = periodIndex.get(period) || new Map()
  const revenue = sumIncomeCredit(pm)
  const expense = sumExpenseDebit(pm)
  const receivable = sumPrefixBalance(total, RECEIVABLE_PREFIX, dirMap)
  const payable = sumPrefixBalance(total, PAYABLE_PREFIX, dirMap)
  const accountBalance = sumPrefixBalance(total, CASH_PREFIX, dirMap)

  const all = (await db.vouchers.toArray()).filter((v) => v.status !== 'void')
  const pendingCount = all.filter((v) => v.status === 'pending').length
  const draftCount = all.filter((v) => v.status === 'draft').length

  return {
    period,
    revenue,
    expense,
    profit: revenue - expense,
    receivable,
    payable,
    accountBalance,
    unauditedCount: pendingCount + draftCount,
    voucherCount: all.length,
    pendingCount,
    draftCount,
  }
}

export interface TrendPoint {
  month: string
  revenue: number
  expense: number
}

export async function getRevenueExpenseTrend(months = 6): Promise<TrendPoint[]> {
  const { periodIndex, dirMap } = await loadAggregates()
  return lastMonths(months).map((month) => {
    const pm = periodIndex.get(month) || new Map()
    return { month, revenue: sumIncomeCredit(pm), expense: sumExpenseDebit(pm) }
  })
}

export interface PiePoint {
  name: string
  value: number
}

export async function getExpensePie(period: string = currentPeriod()): Promise<PiePoint[]> {
  const { periodIndex } = await loadAggregates()
  const pm = periodIndex.get(period) || new Map()
  const cats = new Map<string, number>()
  for (const [code, a] of pm) {
    const cat = expenseCategory(code)
    if (cat) cats.set(cat, (cats.get(cat) || 0) + a.debit)
  }
  return Array.from(cats.entries()).map(([name, value]) => ({ name, value }))
}

export interface ContactPoint {
  month: string
  receivable: number
  payable: number
}

export async function getContactBar(months = 6): Promise<ContactPoint[]> {
  const { periodIndex } = await loadAggregates()
  return lastMonths(months).map((month) => {
    const pm = periodIndex.get(month) || new Map()
    let receivable = 0
    let payable = 0
    for (const [code, a] of pm) {
      if (startsAny(code, RECEIVABLE_PREFIX)) receivable += a.debit
      if (startsAny(code, PAYABLE_PREFIX)) payable += a.credit
    }
    return { month, receivable, payable }
  })
}

export interface FundPoint {
  month: string
  balance: number
}

export async function getFundFlow(months = 6): Promise<FundPoint[]> {
  const { periodIndex } = await loadAggregates()
  let cum = 0
  return lastMonths(months).map((month) => {
    const pm = periodIndex.get(month) || new Map()
    let net = 0
    for (const [code, a] of pm) {
      if (startsAny(code, CASH_PREFIX)) net += a.debit - a.credit
    }
    cum += net
    return { month, balance: cum }
  })
}
