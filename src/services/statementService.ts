import { db } from '@/db/database'
import { listAccounts } from './accountService'
import { getOpeningAgg } from './openingService'
import type { Account } from '@/types/models'

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

/** 截至某期间（含）的累计借贷聚合（仅已审核凭证） */
async function loadCumulative(upToPeriod: string): Promise<{ agg: AggMap; dirMap: Map<string, 'debit' | 'credit'>; accounts: Account[] }> {
  const vouchers = (await db.vouchers.toArray()).filter((v) => v.status === 'audited' && v.period <= upToPeriod)
  const accounts = await listAccounts()
  const dirMap = new Map<string, 'debit' | 'credit'>()
  accounts.forEach((a) => dirMap.set(a.code, a.direction))
  const agg: AggMap = new Map()
  for (const v of vouchers) for (const e of v.entries) addTo(agg, e.accountCode, e.debit, e.credit)
  return { agg, dirMap, accounts }
}

/** 仅某期间的借贷聚合（已审核凭证） */
async function loadPeriod(period: string) {
  const vouchers = (await db.vouchers.toArray()).filter((v) => v.status === 'audited' && v.period === period)
  const agg: AggMap = new Map()
  for (const v of vouchers) for (const e of v.entries) addTo(agg, e.accountCode, e.debit, e.credit)
  return agg
}

/** 科目余额（期末，正数表示按方向结余） */
function balanceOf(code: string, agg: AggMap, dirMap: Map<string, 'debit' | 'credit'>): number {
  const a = agg.get(code)
  if (!a) return 0
  const dir = dirMap.get(code)
  return dir === 'credit' ? a.credit - a.debit : a.debit - a.credit
}

function sumBal(agg: AggMap, dirMap: Map<string, 'debit' | 'credit'>, codes: string[]): number {
  return codes.reduce((s, c) => s + balanceOf(c, agg, dirMap), 0)
}

/** 损益类对权益的净影响：收入(credit方向)为正，费用(debit方向)为负 */
function netProfitOf(agg: AggMap, dirMap: Map<string, 'debit' | 'credit'>, accounts: Account[]): number {
  let net = 0
  for (const a of accounts) {
    if (a.type !== 'profit') continue
    const b = balanceOf(a.code, agg, dirMap)
    net += a.direction === 'credit' ? b : -b
  }
  return net
}

function incomeAmount(agg: AggMap, codes: string[]): number {
  return codes.reduce((s, c) => s + (agg.get(c)?.credit || 0), 0)
}
function expenseAmount(agg: AggMap, codes: string[]): number {
  return codes.reduce((s, c) => s + (agg.get(c)?.debit || 0), 0)
}

/** 可用期间列表（按凭证生成） */
export async function getAvailablePeriods(): Promise<string[]> {
  const vouchers = (await db.vouchers.toArray()).filter((v) => v.status !== 'void')
  const set = new Set(vouchers.map((v) => v.period))
  return Array.from(set).sort()
}

// ===================== 资产负债表 =====================
export interface BsRow {
  item: string
  opening: number
  closing: number
  bold?: boolean
  indent?: boolean
}
export interface BalanceSheet {
  period: string
  assets: BsRow[]
  liabilities: BsRow[]
  assetTotal: number
  liabilityTotal: number
  equityTotal: number
  grandTotal: number
  balanced: boolean
}

export async function getBalanceSheet(period: string): Promise<BalanceSheet> {
  const { agg: curAgg, dirMap, accounts } = await loadCumulative(period)
  const year = Number(period.slice(0, 4))
  const priorClosing = (await loadCumulative(`${year - 1}-12`)).agg

  // 若已存期初（手工录入或年末结账自动开账），优先使用，避免与历史凭证重复计算
  let agg = curAgg
  let opening = priorClosing
  const storedOpening = await getOpeningAgg(year)
  if (storedOpening) {
    const round2 = (n: number) => Math.round(n * 100) / 100
    const sameYear = new Map<string, { debit: number; credit: number }>()
    for (const code of new Set([...curAgg.keys(), ...priorClosing.keys()])) {
      const a = curAgg.get(code) || { debit: 0, credit: 0 }
      const o = priorClosing.get(code) || { debit: 0, credit: 0 }
      sameYear.set(code, { debit: round2(a.debit - o.debit), credit: round2(a.credit - o.credit) })
    }
    const merged = new Map<string, { debit: number; credit: number }>()
    for (const code of new Set([...storedOpening.keys(), ...sameYear.keys()])) {
      const s = storedOpening.get(code) || { debit: 0, credit: 0 }
      const y = sameYear.get(code) || { debit: 0, credit: 0 }
      merged.set(code, { debit: s.debit + y.debit, credit: s.credit + y.credit })
    }
    opening = storedOpening
    agg = merged
  }

  const b = (codes: string[], sign = 1) => sumBal(agg, dirMap, codes) * sign
  const bOpen = (codes: string[], sign = 1) => sumBal(opening, dirMap, codes) * sign

  // 重分类：应付/应收负数项转资产/负债侧
  const apRaw = balanceOf('2202', agg, dirMap)
  const arRaw = balanceOf('1122', agg, dirMap)
  const prepay = balanceOf('1123', agg, dirMap) + (apRaw < 0 ? -apRaw : 0)
  const apShown = Math.max(0, apRaw)
  const advanceReceipt = balanceOf('2203', agg, dirMap) + (arRaw < 0 ? -arRaw : 0)
  const arShown = Math.max(0, arRaw)
  const netProfit = netProfitOf(agg, dirMap, accounts)

  // 资产
  const monetaryOpen = bOpen(['1001', '1002'])
  const monetary = b(['1001', '1002'])
  const fixedNet = b(['1601']) - b(['1602'])
  const fixedNetOpen = bOpen(['1601']) - bOpen(['1602'])
  const currentAsset = monetary + arShown + prepay + balanceOf('1231', agg, dirMap)
  const nonCurrent = fixedNet + balanceOf('1701', agg, dirMap)
  const assetTotal = currentAsset + nonCurrent

  const assets: BsRow[] = [
    { item: '货币资金', opening: monetaryOpen, closing: monetary },
    { item: '应收账款', opening: bOpen(['1122']), closing: arShown, indent: true },
    { item: '预付账款', opening: bOpen(['1123']), closing: prepay, indent: true },
    { item: '其他应收款', opening: bOpen(['1231']), closing: balanceOf('1231', agg, dirMap), indent: true },
    { item: '流动资产合计', opening: 0, closing: currentAsset, bold: true },
    { item: '固定资产净值', opening: fixedNetOpen, closing: fixedNet },
    { item: '无形资产', opening: bOpen(['1701']), closing: balanceOf('1701', agg, dirMap), indent: true },
    { item: '非流动资产合计', opening: 0, closing: nonCurrent, bold: true },
    { item: '资产总计', opening: 0, closing: assetTotal, bold: true },
  ]
  // 修正流动资产/非流动合计的 opening
  assets[4].opening = monetaryOpen + bOpen(['1122']) + bOpen(['1123']) + bOpen(['1231'])
  assets[7].opening = fixedNetOpen + bOpen(['1701'])
  assets[8].opening = assets[4].opening + assets[7].opening

  // 负债
  const liabilityTotal = apShown + advanceReceipt + balanceOf('2001', agg, dirMap) + balanceOf('2211', agg, dirMap) + balanceOf('2221', agg, dirMap) + balanceOf('2241', agg, dirMap)
  const liabilities: BsRow[] = [
    { item: '短期借款', opening: bOpen(['2001']), closing: balanceOf('2001', agg, dirMap) },
    { item: '应付账款', opening: bOpen(['2202']), closing: apShown },
    { item: '预收账款', opening: bOpen(['2203']), closing: advanceReceipt, indent: true },
    { item: '应付职工薪酬', opening: bOpen(['2211']), closing: balanceOf('2211', agg, dirMap), indent: true },
    { item: '应交税费', opening: bOpen(['2221']), closing: balanceOf('2221', agg, dirMap), indent: true },
    { item: '其他应付款', opening: bOpen(['2241']), closing: balanceOf('2241', agg, dirMap), indent: true },
    { item: '流动负债合计', opening: 0, closing: liabilityTotal, bold: true },
    { item: '负债合计', opening: 0, closing: liabilityTotal, bold: true },
  ]
  liabilities[6].opening = bOpen(['2001']) + bOpen(['2202']) + bOpen(['2203']) + bOpen(['2211']) + bOpen(['2221']) + bOpen(['2241'])
  liabilities[7].opening = liabilities[6].opening

  // 所有者权益
  const paidIn = balanceOf('3001', agg, dirMap)
  const profitDist = balanceOf('3104', agg, dirMap)
  const carriedProfit = balanceOf('3103', agg, dirMap) // 本年利润（结转损益后才有余额）
  const equityTotal = paidIn + profitDist + carriedProfit + netProfit
  liabilities.push(
    { item: '实收资本', opening: bOpen(['3001']), closing: paidIn },
    { item: '本年利润', opening: bOpen(['3103']), closing: carriedProfit, indent: true },
    { item: '利润分配', opening: bOpen(['3104']), closing: profitDist, indent: true },
    { item: '未分配利润（损益未结转）', opening: 0, closing: netProfit, indent: true },
    { item: '所有者权益合计', opening: 0, closing: equityTotal, bold: true },
    { item: '负债和所有者权益总计', opening: 0, closing: liabilityTotal + equityTotal, bold: true },
  )
  liabilities[liabilities.length - 2].opening = bOpen(['3001']) + bOpen(['3103']) + bOpen(['3104']) + netProfitOf(opening, dirMap, accounts)
  liabilities[liabilities.length - 1].opening = liabilities[6].opening + liabilities[liabilities.length - 2].opening

  return {
    period,
    assets,
    liabilities,
    assetTotal,
    liabilityTotal,
    equityTotal,
    grandTotal: assetTotal,
    balanced: Math.abs(assetTotal - (liabilityTotal + equityTotal)) < 0.01,
  }
}

// ===================== 利润表 =====================
export interface PlRow {
  item: string
  month: number
  ytd: number
  bold?: boolean
  indent?: boolean
  accounts?: string[] // 该行对应的损益科目（用于下钻）
  vouchers?: CashFlowVoucherRef[] // 来源凭证（本月）
}
export interface ProfitStatement {
  period: string
  rows: PlRow[]
  revenue: number
  netProfit: number
}

export async function getProfitStatement(period: string): Promise<ProfitStatement> {
  const cur = await loadPeriod(period)
  const { agg } = await loadCumulative(period)
  const monthVouchers = (await db.vouchers.toArray()).filter((v) => v.status === 'audited' && v.period === period)

  // 取某组科目在本月已审核凭证中的来源（金额=该科目借方或贷方发生额，正负表示借/贷）
  const vouchersForAccounts = (codes: string[]): CashFlowVoucherRef[] => {
    const set = new Set(codes)
    const refs: CashFlowVoucherRef[] = []
    for (const v of monthVouchers) {
      for (const e of v.entries) {
        if (!set.has(e.accountCode)) continue
        const amount = e.debit - e.credit
        refs.push({ id: v.id, voucherNo: v.voucherNo, date: v.date, summary: e.summary, amount })
      }
    }
    return refs
  }

  const rows: PlRow[] = []
  const push = (item: string, m: number, y: number, opts: { bold?: boolean; indent?: boolean; accounts?: string[] } = {}) => {
    const vouchers = opts.accounts ? vouchersForAccounts(opts.accounts) : undefined
    rows.push({ item, month: m, ytd: y, ...opts, vouchers })
  }

  const revenueM = incomeAmount(cur, ['6001', '6051'])
  const revenueY = incomeAmount(agg, ['6001', '6051'])
  const costM = expenseAmount(cur, ['6401', '6402'])
  const costY = expenseAmount(agg, ['6401', '6402'])
  const sellM = expenseAmount(cur, ['6601'])
  const sellY = expenseAmount(agg, ['6601'])
  const manageM = expenseAmount(cur, ['6602'])
  const manageY = expenseAmount(agg, ['6602'])
  const finM = expenseAmount(cur, ['6603'])
  const finY = expenseAmount(agg, ['6603'])
  const outM = expenseAmount(cur, ['6711'])
  const outY = expenseAmount(agg, ['6711'])
  const taxM = expenseAmount(cur, ['6801'])
  const taxY = expenseAmount(agg, ['6801'])

  const opProfitM = revenueM - costM - sellM - manageM - finM
  const opProfitY = revenueY - costY - sellY - manageY - finY
  const totalProfitM = opProfitM - outM
  const totalProfitY = opProfitY - outY
  const netProfitM = totalProfitM - taxM
  const netProfitY = totalProfitY - taxY

  push('一、营业收入', revenueM, revenueY, { accounts: ['6001', '6051'] })
  push('减：营业成本', -costM, -costY, { indent: true, accounts: ['6401', '6402'] })
  push('减：销售费用', -sellM, -sellY, { indent: true, accounts: ['6601'] })
  push('减：管理费用', -manageM, -manageY, { indent: true, accounts: ['6602'] })
  push('减：财务费用', -finM, -finY, { indent: true, accounts: ['6603'] })
  push('二、营业利润', opProfitM, opProfitY, { bold: true })
  push('减：营业外支出', -outM, -outY, { indent: true, accounts: ['6711'] })
  push('三、利润总额', totalProfitM, totalProfitY, { bold: true })
  push('减：所得税费用', -taxM, -taxY, { indent: true, accounts: ['6801'] })
  push('四、净利润', netProfitM, netProfitY, { bold: true })

  return { period, rows, revenue: revenueY, netProfit: netProfitY }
}

// ===================== 现金流量表（直接法） =====================
export interface CashFlowVoucherRef {
  id: string
  voucherNo: string
  date: string
  summary: string
  amount: number // 该凭证对此项目的现金流量（正负=流入/流出）
}
export interface CashFlowRow {
  item: string
  month: number
  ytd: number
  bold?: boolean
  indent?: boolean
  project?: string // 存在则为可下钻的项目行
  vouchers?: CashFlowVoucherRef[] // 来源凭证（本年累计）
}
export interface CashFlowStatement {
  period: string
  rows: CashFlowRow[]
  netIncrease: number
  operating: number
  investing: number
  financing: number
}

type FlowCategory = 'operating' | 'investing' | 'financing'

function classifyCashFlow(entries: { accountCode: string; accountName: string; debit: number; credit: number; summary: string }[]): { project: string; category: FlowCategory } {
  const cash = entries.filter((e) => e.accountCode.startsWith('1001') || e.accountCode.startsWith('1002'))
  const others = entries.filter((e) => !cash.includes(e))
  if (cash.length === 0) return { project: '收到其他与经营活动有关的现金', category: 'operating' }
  const net = cash.reduce((s, e) => s + e.debit, 0) - cash.reduce((s, e) => s + e.credit, 0)
  const isInflow = net > 0
  const codes = others.map((e) => e.accountCode)
  const has = (p: string) => codes.some((c) => c.startsWith(p))
  if (has('6001') || has('6051') || has('1122') || has('1123'))
    return isInflow ? { project: '销售商品、提供劳务收到的现金', category: 'operating' } : { project: '购买商品、接受劳务支付的现金', category: 'operating' }
  if (has('2202'))
    return isInflow ? { project: '购买商品、接受劳务支付的现金', category: 'operating' } : { project: '购买商品、接受劳务支付的现金', category: 'operating' }
  if (has('2211')) return { project: '支付给职工以及为职工支付的现金', category: 'operating' }
  if (has('1601') || has('1701')) return { project: '购建固定资产、无形资产和其他长期资产支付的现金', category: 'investing' }
  if (has('2001')) return isInflow ? { project: '取得借款收到的现金', category: 'financing' } : { project: '偿还债务支付的现金', category: 'financing' }
  if (['6401', '6402', '6601', '6602', '6603', '6711', '6801'].some((p) => has(p)))
    return isInflow ? { project: '收到的其他与经营活动有关的现金', category: 'operating' } : { project: '支付的其他与经营活动有关的现金', category: 'operating' }
  return isInflow ? { project: '收到的其他与经营活动有关的现金', category: 'operating' } : { project: '支付的其他与经营活动有关的现金', category: 'operating' }
}

type FlowVoucher = { id: string; voucherNo: string; date: string; period: string; entries: { accountCode: string; accountName: string; debit: number; credit: number; summary: string }[] }

function buildCashFlow(vouchers: FlowVoucher[]): Map<string, { amount: number; category: FlowCategory; vouchers: CashFlowVoucherRef[] }> {
  const projects = new Map<string, { amount: number; category: FlowCategory; vouchers: CashFlowVoucherRef[] }>()
  for (const v of vouchers) {
    const cash = v.entries.filter((e) => e.accountCode.startsWith('1001') || e.accountCode.startsWith('1002'))
    if (cash.length === 0) continue
    const net = cash.reduce((s, e) => s + e.debit, 0) - cash.reduce((s, e) => s + e.credit, 0)
    if (Math.abs(net) < 0.005) continue
    const { project, category } = classifyCashFlow(v.entries)
    const cur = projects.get(project) || { amount: 0, category, vouchers: [] }
    cur.amount += net
    const other = v.entries.find((e) => !e.accountCode.startsWith('1001') && !e.accountCode.startsWith('1002'))
    cur.vouchers.push({ id: v.id, voucherNo: v.voucherNo, date: v.date, summary: other?.summary ?? v.entries[0]?.summary ?? '', amount: net })
    projects.set(project, cur)
  }
  return projects
}

export async function getCashFlowStatement(period: string): Promise<CashFlowStatement> {
  const all = (await db.vouchers.toArray()).filter((v) => v.status === 'audited') as FlowVoucher[]
  const monthVouchers = all.filter((v) => v.period === period)
  const ytdVouchers = all.filter((v) => v.period <= period)

  const monthFlow = buildCashFlow(monthVouchers)
  const ytdFlow = buildCashFlow(ytdVouchers)

  // 按项目名对齐合并月/累计，避免项目集合不同时索引错位
  const merged = new Map<string, { category: FlowCategory; month: number; ytd: number; vouchers: CashFlowVoucherRef[] }>()
  const names = new Set<string>([...monthFlow.keys(), ...ytdFlow.keys()])
  for (const name of names) {
    const mc = monthFlow.get(name)
    const yc = ytdFlow.get(name)
    merged.set(name, {
      category: (mc?.category ?? yc?.category)!,
      month: mc?.amount ?? 0,
      ytd: yc?.amount ?? 0,
      vouchers: yc?.vouchers ?? [],
    })
  }

  const rows: CashFlowRow[] = []
  let operating = 0, investing = 0, financing = 0
  const byCat = (cat: FlowCategory, title: string) => {
    const items = Array.from(merged.entries()).filter(([, v]) => v.category === cat)
    const sumY = (pred: (v: { ytd: number }) => boolean) => items.filter(([, v]) => pred(v)).reduce((s, [, v]) => s + v.ytd, 0)
    const sumM = (pred: (v: { month: number }) => boolean) => items.filter(([, v]) => pred(v)).reduce((s, [, v]) => s + v.month, 0)
    const inflowY = sumY((v) => v.ytd > 0)
    const outflowY = sumY((v) => v.ytd < 0)
    const inflowM = sumM((v) => v.month > 0)
    const outflowM = sumM((v) => v.month < 0)
    items.forEach(([name, v]) => rows.push({ item: name, month: v.month, ytd: v.ytd, indent: true, project: name, vouchers: v.vouchers }))
    rows.push({ item: `${title}现金流入小计`, month: inflowM, ytd: inflowY })
    rows.push({ item: `${title}现金流出小计`, month: outflowM, ytd: outflowY })
    const netY = inflowY + outflowY
    const netM = inflowM + outflowM
    rows.push({ item: `${title}产生的现金流量净额`, month: netM, ytd: netY, bold: true })
    return { netM, netY }
  }
  rows.push({ item: '一、经营活动产生的现金流量', month: 0, ytd: 0, bold: true })
  const op = byCat('operating', '经营活动'); operating = op.netY
  rows.push({ item: '二、投资活动产生的现金流量', month: 0, ytd: 0, bold: true })
  const inv = byCat('investing', '投资活动'); investing = inv.netY
  rows.push({ item: '三、筹资活动产生的现金流量', month: 0, ytd: 0, bold: true })
  const fin = byCat('financing', '筹资活动'); financing = fin.netY
  const netY = op.netY + inv.netY + fin.netY
  const netM = op.netM + inv.netM + fin.netM
  rows.push({ item: '现金及现金等价物净增加额', month: netM, ytd: netY, bold: true })
  return { period, rows, netIncrease: netM, operating: op.netY, investing: inv.netY, financing: fin.netY }
}

// ===================== 报表对比（环比 / 同比） =====================
export interface CompareRow {
  period: string
  revenue: number // 营业收入（累计）
  netProfit: number // 净利润（累计）
  asset: number // 资产总额
  momNetProfit?: number // 净利润环比（较上一期）
  yoyNetProfit?: number // 净利润同比（较去年同期）
  momRevenue?: number
  yoyRevenue?: number
}

/** 多期报表对比：返回各期关键指标及环比/同比 */
export async function getComparison(periods: string[]): Promise<CompareRow[]> {
  const sorted = [...periods].sort()
  const base = await Promise.all(
    sorted.map(async (p) => {
      const ps = await getProfitStatement(p)
      const bs = await getBalanceSheet(p)
      return { period: p, revenue: ps.revenue, netProfit: ps.netProfit, asset: bs.assetTotal }
    }),
  )
  const byPeriod = new Map(base.map((r) => [r.period, r]))
  return base.map((r, i) => {
    const [y, m] = r.period.split('-').map(Number)
    const prev = i > 0 ? base[i - 1] : undefined
    const yoyPeriod = `${y - 1}-${String(m).padStart(2, '0')}`
    const yoy = byPeriod.get(yoyPeriod)
    return {
      ...r,
      momNetProfit: prev ? round2(r.netProfit - prev.netProfit) : undefined,
      momRevenue: prev ? round2(r.revenue - prev.revenue) : undefined,
      yoyNetProfit: yoy ? round2(r.netProfit - yoy.netProfit) : undefined,
      yoyRevenue: yoy ? round2(r.revenue - yoy.revenue) : undefined,
    }
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100
