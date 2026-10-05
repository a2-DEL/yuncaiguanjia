import { db } from '@/db/database'
import type { Account, OpeningBalance, OpeningEntry } from '@/types/models'
import { listAccounts } from './accountService'
import { addLog } from './logService'

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

const round = (n: number) => Math.round(n * 100) / 100

/** 截至某期间（含）的累计借贷聚合（仅已审核凭证） */
async function loadCumulative(upTo: string): Promise<{ agg: AggMap; dirMap: Map<string, 'debit' | 'credit'>; accounts: Account[] }> {
  const vouchers = (await db.vouchers.toArray()).filter((v) => v.status === 'audited' && v.period <= upTo)
  const accounts = await listAccounts()
  const dirMap = new Map<string, 'debit' | 'credit'>()
  accounts.forEach((a) => dirMap.set(a.code, a.direction))
  const agg: AggMap = new Map()
  for (const v of vouchers) for (const e of v.entries) addTo(agg, e.accountCode, e.debit, e.credit)
  return { agg, dirMap, accounts }
}

/** 科目余额（正数表示按方向结余） */
function balanceOf(code: string, agg: AggMap, dirMap: Map<string, 'debit' | 'credit'>): number {
  const a = agg.get(code)
  if (!a) return 0
  const dir = dirMap.get(code)
  return dir === 'credit' ? a.credit - a.debit : a.debit - a.credit
}

/** 取某期间末（结账后）资产负债表科目的余额，转为期初借贷表示 */
async function closingEntriesOf(period: string): Promise<OpeningEntry[]> {
  const { agg, dirMap, accounts } = await loadCumulative(period)
  const bsTypes = new Set(['asset', 'liability', 'equity'])
  const entries: OpeningEntry[] = []
  for (const a of accounts) {
    if (!a.isLeaf || !bsTypes.has(a.type)) continue
    const bal = balanceOf(a.code, agg, dirMap)
    if (Math.abs(bal) < 0.005) continue
    // 资产（借）余额为正记借方；负债/权益（贷）余额为正记贷方
    const debit = a.direction === 'debit' ? (bal >= 0 ? bal : 0) : 0
    const credit = a.direction === 'credit' ? (bal >= 0 ? bal : 0) : 0
    entries.push({ accountCode: a.code, accountName: a.name, debit: round(debit), credit: round(credit) })
  }
  return entries
}

export interface OpeningResult {
  year: number
  entries: OpeningEntry[]
  source: 'auto' | 'manual' | 'derived'
  basedOnPeriod?: string
}

/** 读取某年期初余额：已存则直接返回；否则派生自上年 12 月结账余额 */
export async function getOpeningBalance(year: number): Promise<OpeningResult> {
  const stored = await db.openingBalances.get(String(year))
  if (stored) {
    return { year, entries: stored.entries, source: stored.source, basedOnPeriod: stored.basedOnPeriod }
  }
  const prevDec = `${year - 1}-12`
  const entries = await closingEntriesOf(prevDec)
  return { year, entries, source: 'derived', basedOnPeriod: entries.length ? prevDec : undefined }
}

/** 校验期初借贷平衡 */
export function isOpeningBalanced(entries: OpeningEntry[]): boolean {
  const d = entries.reduce((s, e) => s + e.debit, 0)
  const c = entries.reduce((s, e) => s + e.credit, 0)
  return Math.abs(d - c) < 0.01
}

/** 手工录入期初余额（新账套启用 / 覆盖） */
export async function saveManualOpening(year: number, entries: OpeningEntry[]): Promise<void> {
  if (!isOpeningBalanced(entries)) throw new Error('期初余额借贷不平衡，无法保存')
  const rec: OpeningBalance = {
    id: String(year),
    year,
    entries: entries.map((e) => ({ ...e, debit: round(e.debit), credit: round(e.credit) })),
    source: 'manual',
    createdAt: Date.now(),
  }
  await db.openingBalances.put(rec)
  await addLog('期初余额', '期末结账', `手工录入 ${year} 年期初余额`)
}

/** 删除某年期初（回到派生/空） */
export async function deleteOpening(year: number): Promise<void> {
  await db.openingBalances.delete(String(year))
  await addLog('期初余额', '期末结账', `清空 ${year} 年期初余额`)
}

/** 年末结账后自动开账：将本年 12 月结账余额结转至下年期初 */
export async function autoOpenYear(yearEndPeriod: string): Promise<OpeningResult> {
  if (!yearEndPeriod.endsWith('-12')) throw new Error('仅年末（12 月）结账后可自动开账')
  const year = Number(yearEndPeriod.slice(0, 4))
  const nextYear = year + 1
  const entries = await closingEntriesOf(yearEndPeriod)
  if (!isOpeningBalanced(entries)) throw new Error('自动开账失败：结转余额借贷不平衡')
  const rec: OpeningBalance = {
    id: String(nextYear),
    year: nextYear,
    entries,
    source: 'auto',
    basedOnPeriod: yearEndPeriod,
    createdAt: Date.now(),
  }
  await db.openingBalances.put(rec)
  await addLog('自动开账', '期末结账', `年末结账 ${yearEndPeriod} 自动生成 ${nextYear} 年期初余额`)
  return { year: nextYear, entries, source: 'auto', basedOnPeriod: yearEndPeriod }
}

/** 期初余额聚合（用于报表计算）；无记录返回 null */
export async function getOpeningAgg(year: number): Promise<AggMap | null> {
  const stored = await db.openingBalances.get(String(year))
  if (!stored) return null
  const m: AggMap = new Map()
  for (const e of stored.entries) addTo(m, e.accountCode, e.debit, e.credit)
  return m
}
