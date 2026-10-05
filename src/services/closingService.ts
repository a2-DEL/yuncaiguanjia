import { db } from '@/db/database'
import type { Account, Voucher, VoucherEntry, CloseRecord } from '@/types/models'
import { generateVoucherNo } from '@/utils/voucherNo'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { emit } from './webhookService'
import { listAccounts } from './accountService'
import { getAvailablePeriods } from './statementService'
import { autoOpenYear } from './openingService'
import { useUserStore } from '@/store/userStore'

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

function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const dd = String(new Date(y, m, 0).getDate()).padStart(2, '0')
  return `${y}-${String(m).padStart(2, '0')}-${dd}`
}

function entryFrom(summary: string, code: string, name: string, debit = 0, credit = 0): VoucherEntry {
  return { id: uid('e_'), summary, accountCode: code, accountName: name, debit: round(debit), credit: round(credit) }
}

// ===================== 对外类型 =====================
export interface CarryForwardItem {
  code: string
  name: string
  kind: 'income' | 'expense'
  balance: number // 正数：收入=贷方余额，费用=借方余额
}

export interface CloseInfo {
  period: string
  hasUnaudited: number // 本期未审核（草稿/待审核）凭证数
  prevUnclosed?: string // 上一期（有凭证但未结账）期间，存在则禁止跳期结账
  profitItems: CarryForwardItem[] // 待结转损益明细（结转后为 0）
  netProfit: number // 本期净利润（损益净影响）
  hasCarryForward: boolean // 是否已结转损益
  carryForwardVoucherId?: string
  yearEndDone: boolean // 是否已完成年末结转
  isClosed: boolean // 是否已结账
  closedAt?: number
  closedBy?: string
}

export async function getCloseRecord(period: string): Promise<CloseRecord | undefined> {
  return db.closings.get(period)
}

/** 查询某期间的结账信息与损益结转预览 */
export async function getClosingInfo(period: string): Promise<CloseInfo> {
  const { agg, dirMap, accounts } = await loadCumulative(period)
  const profitAccounts = accounts.filter((a) => a.type === 'profit' && a.isLeaf)
  const profitItems: CarryForwardItem[] = []
  let netProfit = 0
  for (const a of profitAccounts) {
    const bal = balanceOf(a.code, agg, dirMap) // 按方向结余
    if (Math.abs(bal) < 0.005) continue
    const signed = a.direction === 'credit' ? bal : -bal // 收入为正，费用为负
    profitItems.push({
      code: a.code,
      name: a.name,
      kind: a.direction === 'credit' ? 'income' : 'expense',
      balance: bal,
    })
    netProfit += signed
  }
  const all = await db.vouchers.toArray()
  const hasUnaudited = all.filter((v) => v.period === period && v.status !== 'audited' && v.status !== 'void').length
  // 上一期（存在凭证且早于本期）中结账最晚的一个，若未结账则禁止跳期
  const prevWithData = (await getAvailablePeriods()).filter((p) => p < period).pop()
  const prevUnclosed = prevWithData && !(await isPeriodClosed(prevWithData)) ? prevWithData : undefined
  const rec = await getCloseRecord(period)
  return {
    period,
    hasUnaudited,
    prevUnclosed,
    profitItems,
    netProfit: round(netProfit),
    hasCarryForward: !!(rec?.carryForwardVoucherId || rec?.carried),
    carryForwardVoucherId: rec?.carryForwardVoucherId,
    yearEndDone: !!rec?.yearEndDone,
    isClosed: !!rec?.closedAt,
    closedAt: rec?.closedAt,
    closedBy: rec?.closedBy,
  }
}

async function saveClosingVoucher(period: string, entries: VoucherEntry[], remark: string): Promise<Voucher> {
  const user = useUserStore.getState().currentUser
  const no = await generateVoucherNo(period)
  const voucher: Voucher = {
    id: uid('v_'),
    voucherNo: no,
    date: lastDayOf(period),
    period,
    entries,
    status: 'audited',
    attachments: [],
    creator: user?.name ?? '系统',
    auditor: '结账',
    auditedAt: Date.now(),
    createdAt: Date.now(),
    remark,
  }
  await db.vouchers.add(voucher)
  return voucher
}

/** 结转损益：将所有损益类科目余额结转到「本年利润(3103)」 */
export async function carryForwardProfit(period: string): Promise<{ voucherId?: string; netProfit: number }> {
  const { agg, dirMap, accounts } = await loadCumulative(period)
  const profitAccounts = accounts.filter((a) => a.type === 'profit' && a.isLeaf)
  const summary = `结转 ${period} 本期损益`
  const entries: VoucherEntry[] = []
  let total = 0
  for (const a of profitAccounts) {
    const bal = balanceOf(a.code, agg, dirMap)
    if (Math.abs(bal) < 0.005) continue
    if (a.direction === 'credit') {
      // 收入类：借：收入科目，贷：本年利润
      entries.push(entryFrom(summary, a.code, a.name, bal, 0))
      entries.push(entryFrom(summary, '3103', '本年利润', 0, bal))
      total += bal
    } else {
      // 费用类：借：本年利润，贷：费用科目
      entries.push(entryFrom(summary, '3103', '本年利润', bal, 0))
      entries.push(entryFrom(summary, a.code, a.name, 0, bal))
      total -= bal
    }
  }

  const rec = (await getCloseRecord(period)) || { period }
  // 幂等：若已生成结转凭证，先删除再重建（支持结账后补录凭证重新结转）
  if (rec.carryForwardVoucherId) await db.vouchers.delete(rec.carryForwardVoucherId)

  if (entries.length === 0) {
    await db.closings.put({ ...rec, period, carried: true, carryForwardVoucherId: undefined })
    return { netProfit: 0 }
  }
  const voucher = await saveClosingVoucher(period, entries, summary)
  await db.closings.put({ ...rec, period, carryForwardVoucherId: voucher.id, carried: true })
  await addLog('结转损益', '期末结账', `结转 ${period} 损益，生成凭证 ${voucher.voucherNo}`)
  return { voucherId: voucher.id, netProfit: round(total) }
}

/** 年末结转：将「本年利润(3103)」结转到「利润分配(3104)」（仅 12 月） */
export async function yearEndTransfer(period: string): Promise<{ voucherId?: string }> {
  if (!period.endsWith('-12')) throw new Error('仅年末（12 月）可执行本年利润结转利润分配')
  const { agg, dirMap } = await loadCumulative(period)
  const profit3103 = balanceOf('3103', agg, dirMap) // credit 方向，正值=盈利
  const rec = (await getCloseRecord(period)) || { period }
  if (rec.yearEndVoucherId) await db.vouchers.delete(rec.yearEndVoucherId)
  if (Math.abs(profit3103) < 0.005) {
    await db.closings.put({ ...rec, period, yearEndDone: true, yearEndVoucherId: undefined })
    return {}
  }
  const summary = `结转 ${period} 本年利润`
  const entries: VoucherEntry[] =
    profit3103 >= 0
      ? [entryFrom(summary, '3103', '本年利润', profit3103, 0), entryFrom(summary, '3104', '利润分配', 0, profit3103)]
      : [entryFrom(summary, '3104', '利润分配', -profit3103, 0), entryFrom(summary, '3103', '本年利润', 0, -profit3103)]
  const voucher = await saveClosingVoucher(period, entries, summary)
  await db.closings.put({ ...rec, period, yearEndVoucherId: voucher.id, yearEndDone: true })
  await addLog('年末结转', '期末结账', `结转 ${period} 本年利润至利润分配，生成凭证 ${voucher.voucherNo}`)
  return { voucherId: voucher.id }
}

/** 期末结账：校验 → 结转损益 →（年末）结转本年利润 → 标记已结账 */
export async function closePeriod(period: string, opts?: { yearEnd?: boolean }): Promise<void> {
  const info = await getClosingInfo(period)
  if (info.hasUnaudited > 0) {
    throw new Error(`本期还有 ${info.hasUnaudited} 张未审核凭证，请先完成审核后再结账`)
  }
  if (info.prevUnclosed) {
    throw new Error(`请先结账上一期 ${info.prevUnclosed}，禁止跳期结账（须按会计期间顺序依次关账）`)
  }
  if (!info.hasCarryForward) await carryForwardProfit(period)
  const doYearEnd = period.endsWith('-12') && (opts?.yearEnd ?? true)
  if (doYearEnd && !(await getCloseRecord(period))?.yearEndDone) await yearEndTransfer(period)
  const user = useUserStore.getState().currentUser
  const rec = (await getCloseRecord(period)) || { period }
  await db.closings.put({ ...rec, period, closedAt: Date.now(), closedBy: user?.name ?? '系统' })
  await addLog('期末结账', '期末结账', `结账 ${period}`)
  void emit('period.closed', { period })
  // 年末结账后自动驱动下年期初数（开账）
  if (period.endsWith('-12')) {
    try {
      await autoOpenYear(period)
    } catch {
      // 余额不平衡等异常不阻断结账，仅跳过自动开账
    }
  }
}

/** 反结账：仅解除结账标记（结转凭证保留，可重新结账触发幂等重建） */
export async function reopenPeriod(period: string): Promise<void> {
  const rec = await getCloseRecord(period)
  if (!rec) return
  await db.closings.put({ ...rec, closedAt: undefined, closedBy: undefined })
  await addLog('反结账', '期末结账', `反结账 ${period}`)
}

// ===================== 结账总览 / 期间锁定 =====================
export interface ClosingOverviewRow {
  period: string
  hasCarryForward: boolean
  yearEndDone: boolean
  isClosed: boolean
  closedAt?: number
  closedBy?: string
}

/** 所有期间的结账进度总览（含已结账但无凭证的期间） */
export async function getClosingOverview(): Promise<ClosingOverviewRow[]> {
  const periods = await getAvailablePeriods()
  const records = await db.closings.toArray()
  const recMap = new Map(records.map((r) => [r.period, r]))
  const all = Array.from(new Set([...periods, ...recMap.keys()])).sort()
  return all.map((p) => {
    const rec = recMap.get(p)
    return {
      period: p,
      hasCarryForward: !!(rec?.carryForwardVoucherId || rec?.carried),
      yearEndDone: !!rec?.yearEndDone,
      isClosed: !!rec?.closedAt,
      closedAt: rec?.closedAt,
      closedBy: rec?.closedBy,
    }
  })
}

/** 某期间是否已结账（用于凭证锁定校验） */
export async function isPeriodClosed(period: string): Promise<boolean> {
  const rec = await db.closings.get(period)
  return !!rec?.closedAt
}
