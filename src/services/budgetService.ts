import { db } from '@/db/database'
import type { Budget, Account, BudgetPeriodType } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from './logService'

export type BudgetStatus = 'normal' | 'over' | 'none'

export interface BudgetRow {
  id: string
  periodType: BudgetPeriodType
  period: string
  year: number
  accountCode: string
  accountName: string
  amount: number // 预算额
  actual: number // 实际发生额（按科目方向取净发生，正数）
  actualYoY?: number // 上年同期实际
  actualMoM?: number // 上期实际（月度=上月，季度=上季，年度=上年）
  variance: number // 预算 - 实际（正=结余，负=超支）
  rate: number // 实际 / 预算
  status: BudgetStatus // normal=正常 over=超支 none=未执行
}

export interface BudgetCompareParams {
  periodType: BudgetPeriodType
  period: string // month: YYYY-MM；quarter: YYYY-Qn；year: YYYY
  year: number
}

/** 取维度对应的月份列表 */
function periodsToMonths(p: BudgetCompareParams): string[] {
  if (p.periodType === 'year') {
    return Array.from({ length: 12 }, (_, i) => `${p.year}-${String(i + 1).padStart(2, '0')}`)
  }
  if (p.periodType === 'quarter') {
    const m = /^(\d{4})-Q(\d)$/.exec(p.period)
    const y = m ? Number(m[1]) : p.year
    const q = m ? Number(m[2]) : 1
    const start = (q - 1) * 3 + 1
    return Array.from({ length: 3 }, (_, i) => `${y}-${String(start + i).padStart(2, '0')}`)
  }
  return [p.period]
}

function shiftYear(p: BudgetCompareParams, delta: number): BudgetCompareParams {
  if (p.periodType === 'year') {
    const y = p.year + delta
    return { ...p, year: y, period: String(y) }
  }
  if (p.periodType === 'quarter') {
    const m = /^(\d{4})-Q(\d)$/.exec(p.period)!
    const y = Number(m[1]) + delta
    return { ...p, year: y, period: `${y}-Q${m[2]}` }
  }
  const [y, mo] = p.period.split('-').map(Number)
  const d = new Date(y, mo - 1, 1)
  d.setFullYear(d.getFullYear() + delta)
  const ny = d.getFullYear()
  const nmo = d.getMonth() + 1
  return { ...p, year: ny, period: `${ny}-${String(nmo).padStart(2, '0')}` }
}

function prevPeriod(p: BudgetCompareParams): BudgetCompareParams {
  if (p.periodType === 'year') return shiftYear(p, -1)
  if (p.periodType === 'quarter') {
    const m = /^(\d{4})-Q(\d)$/.exec(p.period)!
    let y = Number(m[1])
    let q = Number(m[2]) - 1
    if (q === 0) { q = 4; y -= 1 }
    return { ...p, year: y, period: `${y}-Q${q}` }
  }
  const [y, mo] = p.period.split('-').map(Number)
  const d = new Date(y, mo - 1, 1)
  d.setMonth(d.getMonth() - 1)
  const ny = d.getFullYear()
  const nmo = d.getMonth() + 1
  return { ...p, year: ny, period: `${ny}-${String(nmo).padStart(2, '0')}` }
}

/** 新增或更新某科目某维度预算（按 periodType+period+accountCode 幂等） */
export async function saveBudget(input: {
  periodType: BudgetPeriodType
  period: string
  year: number
  accountCode: string
  accountName: string
  amount: number
}): Promise<Budget> {
  const existing = await db.budgets
    .filter((b) => (b.periodType ?? 'month') === input.periodType && b.period === input.period && b.accountCode === input.accountCode)
    .first()
  if (existing) {
    await db.budgets.update(existing.id, { amount: input.amount, accountName: input.accountName, updatedAt: Date.now() })
    await addLog('更新预算', '预算管理', `更新 ${input.period}(${input.periodType}) ${input.accountName} 预算 ¥${input.amount.toFixed(2)}`)
    return { ...existing, amount: input.amount, accountName: input.accountName, updatedAt: Date.now() }
  }
  const budget: Budget = {
    id: uid('bg_'),
    periodType: input.periodType,
    period: input.period,
    year: input.year,
    accountCode: input.accountCode,
    accountName: input.accountName,
    amount: input.amount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.budgets.add(budget)
  await addLog('新增预算', '预算管理', `新增 ${input.period}(${input.periodType}) ${input.accountName} 预算 ¥${input.amount.toFixed(2)}`)
  return budget
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}

export async function listBudgets(periodType?: BudgetPeriodType, period?: string): Promise<Budget[]> {
  const all = await db.budgets.toArray()
  return (periodType ? all.filter((b) => (b.periodType ?? 'month') === periodType && (!period || b.period === period)) : all)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

/** 计算某维度预算与实际对比（实际基于已审核凭证的分录发生额，含上年同期与环比） */
export async function getBudgetComparison(p: BudgetCompareParams): Promise<BudgetRow[]> {
  const budgets = await db.budgets
    .filter((b) => (b.periodType ?? 'month') === p.periodType && b.period === p.period)
    .toArray()
  if (!budgets.length) return []

  const monthsMain = periodsToMonths(p)
  const monthsYoY = periodsToMonths(shiftYear(p, -1))
  const monthsMoM = periodsToMonths(prevPeriod(p))
  const allMonths = Array.from(new Set([...monthsMain, ...monthsYoY, ...monthsMoM]))

  const accounts = await db.accounts.toArray()
  const accMap = new Map(accounts.map((a) => [a.code, a as Account]))

  const vouchers = await db.vouchers.where('period').anyOf(allMonths).filter((v) => v.status === 'audited').toArray()
  // accountCode -> month -> {debit, credit}
  const byAccount = new Map<string, Map<string, { debit: number; credit: number }>>()
  for (const v of vouchers) {
    for (const e of v.entries) {
      if (!byAccount.has(e.accountCode)) byAccount.set(e.accountCode, new Map())
      const m = byAccount.get(e.accountCode)!
      const cur = m.get(v.period) ?? { debit: 0, credit: 0 }
      cur.debit += e.debit
      cur.credit += e.credit
      m.set(v.period, cur)
    }
  }

  const sumActual = (code: string, months: string[]): number => {
    const m = byAccount.get(code)
    const dir = accMap.get(code)?.direction ?? 'debit'
    let d = 0
    let c = 0
    for (const mo of months) {
      const x = m?.get(mo)
      if (x) { d += x.debit; c += x.credit }
    }
    return Math.round((dir === 'credit' ? c - d : d - c) * 100) / 100
  }

  return budgets.map((b) => {
    const actual = sumActual(b.accountCode, monthsMain)
    const actualYoY = sumActual(b.accountCode, monthsYoY)
    const actualMoM = sumActual(b.accountCode, monthsMoM)
    const variance = Math.round((b.amount - actual) * 100) / 100
    const rate = b.amount > 0 ? Math.round((actual / b.amount) * 1000) / 1000 : 0
    const status: BudgetStatus = Math.abs(actual) < 0.005 ? 'none' : variance < 0 ? 'over' : 'normal'
    return { ...b, actual, actualYoY, actualMoM, variance, rate, status }
  })
}
