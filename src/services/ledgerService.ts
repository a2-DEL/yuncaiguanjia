import { db } from '@/db/database'
import { listAccounts, createAccount, getAccount } from './accountService'
import type { Account, VoucherEntry } from '@/types/models'
import type { CashFlowVoucherRef } from './statementService'
import { getAvailablePeriods } from './statementService'
import { getRate } from './exchangeRateService'
import { saveVoucher, auditVoucher } from './voucherService'
import { useUserStore } from '@/store/userStore'
import { uid } from '@/utils/format'

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

async function loadCumulative(upTo: string, includeEq: boolean): Promise<{ agg: AggMap; dirMap: Map<string, 'debit' | 'credit'> }> {
  const vouchers = (await db.vouchers.toArray()).filter(
    (v) => v.status === 'audited' && (includeEq ? v.period <= upTo : v.period < upTo),
  )
  const accounts = await listAccounts()
  const dirMap = new Map<string, 'debit' | 'credit'>()
  accounts.forEach((a) => dirMap.set(a.code, a.direction))
  const agg: AggMap = new Map()
  for (const v of vouchers) for (const e of v.entries) addTo(agg, e.accountCode, e.debit, e.credit)
  return { agg, dirMap }
}

function balanceOf(code: string, agg: AggMap, dirMap: Map<string, 'debit' | 'credit'>): number {
  const a = agg.get(code)
  if (!a) return 0
  const dir = dirMap.get(code)
  return dir === 'credit' ? a.credit - a.debit : a.debit - a.credit
}

export interface DirBal {
  dir: '借' | '贷'
  amount: number
}
/** 把按方向结余的金额转换为带借/贷方向的展示 */
function toDir(bal: number, direction: 'debit' | 'credit'): DirBal {
  const pos = direction === 'credit' ? '贷' : '借'
  const neg = direction === 'credit' ? '借' : '贷'
  return bal >= 0 ? { dir: pos, amount: bal } : { dir: neg, amount: -bal }
}

// ===================== 总账 =====================
export interface GeneralLedgerRow {
  code: string
  name: string
  type: Account['type']
  openingDir: '借' | '贷'
  opening: number
  periodDebit: number
  periodCredit: number
  closingDir: '借' | '贷'
  closing: number
}

export async function getGeneralLedger(period: string): Promise<GeneralLedgerRow[]> {
  const { agg: periodAgg, dirMap } = await loadCumulative(period, true)
  const { agg: openAgg } = await loadCumulative(period, false)
  const accounts = await listAccounts()
  const rows: GeneralLedgerRow[] = []
  for (const a of accounts) {
    const opening = balanceOf(a.code, openAgg, dirMap)
    const p = periodAgg.get(a.code)
    const pdebit = p?.debit || 0
    const pcredit = p?.credit || 0
    const closing = opening + pdebit - pcredit
    if (opening === 0 && pdebit === 0 && pcredit === 0 && closing === 0) continue
    const o = toDir(opening, a.direction)
    const c = toDir(closing, a.direction)
    rows.push({
      code: a.code, name: a.name, type: a.type,
      openingDir: o.dir, opening: o.amount,
      periodDebit: pdebit, periodCredit: pcredit,
      closingDir: c.dir, closing: c.amount,
    })
  }
  rows.sort((x, y) => x.code.localeCompare(y.code))
  return rows
}

// ===================== 明细账 =====================
export interface DetailRow {
  id: string
  date: string
  voucherNo: string
  summary: string
  debit: number
  credit: number
  balanceDir: '借' | '贷'
  balance: number
}
export interface DetailLedger {
  account: Account
  openingDir: '借' | '贷'
  opening: number
  rows: DetailRow[]
  periodDebit: number
  periodCredit: number
  closingDir: '借' | '贷'
  closing: number
}

export async function getDetailLedger(accountCode: string, period: string): Promise<DetailLedger> {
  const accounts = await listAccounts()
  const account = accounts.find((a) => a.code === accountCode)
  if (!account) throw new Error('科目不存在')
  const { dirMap } = await loadCumulative(period, true)
  const { agg: openAgg } = await loadCumulative(period, false)
  const opening = balanceOf(accountCode, openAgg, dirMap)
  const vouchers = (await db.vouchers.toArray())
    .filter((v) => v.status === 'audited' && v.period === period)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voucherNo.localeCompare(b.voucherNo)))

  let running = opening
  let pdebit = 0
  let pcredit = 0
  const rows: DetailRow[] = []
  for (const v of vouchers) {
    for (const e of v.entries) {
      if (e.accountCode !== accountCode) continue
      running += e.debit - e.credit
      pdebit += e.debit
      pcredit += e.credit
      const bd = toDir(running, account.direction)
      rows.push({
        id: v.id, date: v.date, voucherNo: v.voucherNo, summary: e.summary,
        debit: e.debit, credit: e.credit, balanceDir: bd.dir, balance: bd.amount,
      })
    }
  }
  const o = toDir(opening, account.direction)
  const c = toDir(opening + pdebit - pcredit, account.direction)
  return {
    account, openingDir: o.dir, opening: o.amount, rows,
    periodDebit: pdebit, periodCredit: pcredit, closingDir: c.dir, closing: c.amount,
  }
}

/** 取某科目在指定期间的来源凭证（已审核），金额=该科目本期借减贷 */
export async function getAccountVouchers(code: string, period: string): Promise<CashFlowVoucherRef[]> {
  const vouchers = (await db.vouchers.toArray())
    .filter((v) => v.status === 'audited' && v.period === period)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voucherNo.localeCompare(b.voucherNo)))
  const refs: CashFlowVoucherRef[] = []
  for (const v of vouchers) {
    for (const e of v.entries) {
      if (e.accountCode !== code) continue
      refs.push({ id: v.id, voucherNo: v.voucherNo, date: v.date, summary: e.summary, amount: e.debit - e.credit })
    }
  }
  return refs
}

/** 外币余额表：按外币核算科目列出原币与本位币的发生额/余额 */
export interface ForeignBalanceRow {
  code: string
  name: string
  currency: string
  openingForeign: number
  openingBase: number
  periodDebitForeign: number
  periodCreditForeign: number
  periodDebitBase: number
  periodCreditBase: number
  closingForeign: number
  closingBase: number
  rate: number
}

export async function getForeignBalance(period: string): Promise<ForeignBalanceRow[]> {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const all = (await db.vouchers.toArray()).filter((v) => v.status === 'audited')
  const fcAccounts = (await listAccounts()).filter((a) => a.currency)
  const rows: ForeignBalanceRow[] = []
  for (const acc of fcAccounts) {
    const cur = acc.currency!
    const rate = (await getRate(cur, `${period}-15`)) ?? 1
    let opF = 0, opB = 0, pdF = 0, pcF = 0, pdB = 0, pcB = 0
    for (const v of all) {
      for (const e of v.entries) {
        if (e.accountCode !== acc.code) continue
        const fDebit = e.debit > 0 ? (e.foreignAmount ?? 0) : 0
        const fCredit = e.credit > 0 ? (e.foreignAmount ?? 0) : 0
        if (v.period < period) {
          opF += fDebit - fCredit
          opB += e.debit - e.credit
        } else {
          pdF += fDebit; pcF += fCredit
          pdB += e.debit; pcB += e.credit
        }
      }
    }
    rows.push({
      code: acc.code, name: acc.name, currency: cur,
      openingForeign: round2(opF), openingBase: round2(opB),
      periodDebitForeign: round2(pdF), periodCreditForeign: round2(pcF),
      periodDebitBase: round2(pdB), periodCreditBase: round2(pcB),
      closingForeign: round2(opF + pdF - pcF), closingBase: round2(opB + pdB - pcB),
      rate,
    })
  }
  return rows
}

/** 期末调汇单行：按期末汇率重算本位币后与原账面本位币的差异 */
export interface ExchangeAdjustmentLine {
  code: string
  name: string
  currency: string
  closingForeign: number // 期末原币
  oldBase: number // 原账面本位币
  newBase: number // 按期末汇率折算的本位币
  adjustment: number // newBase - oldBase（正数=调增，负数=调减）
  rate: number // 期末汇率
}

/** 取某期间的月末日期（YYYY-MM-DD） */
function lastDayOfMonth(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${period}-${String(d).padStart(2, '0')}`
}

/**
 * 预览期末调汇：根据已审核凭证计算各外币核算科目在指定汇率日期下的账面调整额。
 * rateDate 缺省为期间月末。仅返回调整额不为 0 的科目，不落库。
 */
export async function previewExchangeAdjustment(period: string, rateDate?: string): Promise<ExchangeAdjustmentLine[]> {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const all = (await db.vouchers.toArray()).filter((v) => v.status === 'audited')
  const fcAccounts = (await listAccounts()).filter((a) => a.currency)
  const date = rateDate ?? lastDayOfMonth(period)
  const lines: ExchangeAdjustmentLine[] = []
  for (const acc of fcAccounts) {
    const cur = acc.currency!
    const endRate = (await getRate(cur, date)) ?? 1
    let opF = 0, opB = 0, pdF = 0, pcF = 0, pdB = 0, pcB = 0
    for (const v of all) {
      for (const e of v.entries) {
        if (e.accountCode !== acc.code) continue
        const fDebit = e.debit > 0 ? (e.foreignAmount ?? 0) : 0
        const fCredit = e.credit > 0 ? (e.foreignAmount ?? 0) : 0
        if (v.period < period) {
          opF += fDebit - fCredit
          opB += e.debit - e.credit
        } else {
          pdF += fDebit; pcF += fCredit
          pdB += e.debit; pcB += e.credit
        }
      }
    }
    const closingForeign = round2(opF + pdF - pcF)
    const closingBase = round2(opB + pdB - pcB)
    const newBase = round2(closingForeign * endRate)
    const adjustment = round2(newBase - closingBase)
    if (Math.abs(adjustment) < 0.005) continue
    lines.push({ code: acc.code, name: acc.name, currency: cur, closingForeign, oldBase: closingBase, newBase, adjustment, rate: endRate })
  }
  return lines
}

/** 确保「6603 财务费用」下存在「660303 汇兑损益」科目，返回该科目 */
async function ensureFxLossAccount(): Promise<Account> {
  const existing = (await listAccounts()).find((a) => a.code === '660303' || a.name === '汇兑损益')
  if (existing) return existing
  await createAccount({ code: '660303', name: '汇兑损益', parentCode: '6603', type: 'profit', direction: 'debit' })
  return (await getAccount('660303'))!
}

/**
 * 生成期末调汇凭证：按指定汇率日期重算各外币科目本位币，差异计入「财务费用-汇兑损益」。
 * autoAudit 为 true 时生成后直接审核入账（预览弹窗即视为复核环节）。
 */
export async function generateExchangeAdjustment(
  period: string,
  opts?: { rateDate?: string; autoAudit?: boolean },
): Promise<{ voucherId: string; voucherNo: string; lines: ExchangeAdjustmentLine[]; audited: boolean }> {
  const rateDate = opts?.rateDate ?? lastDayOfMonth(period)
  const lines = await previewExchangeAdjustment(period, rateDate)
  if (lines.length === 0) throw new Error('当前期间无需要调整的外币余额（汇率无变动或余额为零）')
  const fxAcc = await ensureFxLossAccount()
  const entries: VoucherEntry[] = []
  for (const l of lines) {
    const adj = l.adjustment
    entries.push({
      id: uid('e_'),
      summary: `期末调汇-${l.currency}`,
      accountCode: l.code,
      accountName: l.name,
      currency: l.currency,
      exchangeRate: l.rate,
      foreignAmount: 0,
      debit: adj > 0 ? adj : 0,
      credit: adj < 0 ? -adj : 0,
    })
    entries.push({
      id: uid('e_'),
      summary: `期末调汇-${l.currency}`,
      accountCode: fxAcc.code,
      accountName: fxAcc.name,
      debit: adj < 0 ? -adj : 0,
      credit: adj > 0 ? adj : 0,
    })
  }
  const voucher = await saveVoucher({
    date: rateDate,
    entries,
    remark: `期末调汇 ${period}`,
    creator: useUserStore.getState().currentUser?.name ?? 'system',
  })
  let audited = false
  if (opts?.autoAudit) {
    await auditVoucher(voucher.id)
    audited = true
  }
  return { voucherId: voucher.id, voucherNo: voucher.voucherNo, lines, audited }
}

/**
 * 折算差异报表：以对比日期汇率重算各外币科目本位币，与账面本位币的差异。
 * 直接复用期末调汇的计算口径（previewExchangeAdjustment），compareDate 为任一历史/期末日期。
 */
export async function getTranslationDifference(period: string, compareDate: string): Promise<ExchangeAdjustmentLine[]> {
  return previewExchangeAdjustment(period, compareDate)
}

export { getAvailablePeriods }
