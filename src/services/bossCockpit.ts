/**
 * 老板驾驶舱数据服务：把会计数据翻译成老板关心的 5 个数。
 * 全部本地计算，不依赖 API Key——AI 只负责最后那句"参谋建议"。
 *
 * 核心问题是：
 *   1. 我现在能动用的钱有多少？
 *   2. 未来 30 天会不会断粮？
 *   3. 这个月赚了还是亏了？
 *   4. 哪笔钱出问题了？
 *   5. 税务上有没有红线要踩？
 */
import { db } from '@/db/database'
import { getAccountSummary } from './bankService'
import { listArApBills } from './arApBillService'
import { getDashboard } from './reportService'
import { currentPeriod } from '@/utils/format'
import type { ArApBill } from '@/types/models'

export interface CashFlowPoint {
  date: string      // YYYY-MM-DD
  daysFromNow: number
  balance: number   // 预计账户余额
  inflow: number
  outflow: number
}

export interface BossAlert {
  level: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface BossCockpit {
  availableFunds: number        // 当前可动用资金
  thisMonthRevenue: number
  thisMonthExpense: number
  thisMonthProfit: number
  grossMargin: number          // 毛利率 %
  upcomingReceipts: number      // 30 天内预计回款
  upcomingPayments: number      // 30 天内预计要付
  minBalanceIn30d: number       // 30 天内最低点（断粮预警）
  cashRunwayDays: number        // 按当前烧钱速度，现金能撑几天
  curve: CashFlowPoint[]
  alerts: BossAlert[]
  topDebtors: { name: string; amount: number; daysOverdue: number }[]
}

function today(): Date { return new Date() }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 取未来 N 天内到期的应收/应付 */
function dueWithin(bills: ArApBill[], direction: 'receivable' | 'payable', days: number) {
  const now = today()
  const end = addDays(now, days)
  return bills.filter((b) => {
    if (b.direction !== direction) return false
    if (b.status === 'closed') return false
    if (!b.dueDate) return false
    const due = new Date(b.dueDate)
    return due >= now && due <= end
  })
}

function overdueBills(bills: ArApBill[], direction: 'receivable' | 'payable') {
  const now = today()
  return bills.filter((b) => {
    if (b.direction !== direction) return false
    if (b.status === 'closed') return false
    if (!b.dueDate) return false
    return new Date(b.dueDate) < now
  })
}

export async function getBossCockpit(): Promise<BossCockpit> {
  const period = currentPeriod()

  // 1. 可动用资金 = 各银行/现金账户余额合计
  const summaries = await getAccountSummary()
  const availableFunds = summaries.reduce((s, x) => s + x.balance, 0)

  // 2. 本月经营
  const dash = await getDashboard(period)
  const thisMonthRevenue = dash.revenue
  const thisMonthExpense = dash.expense
  const thisMonthProfit = dash.profit
  const grossMargin = thisMonthRevenue > 0
    ? Math.round(((thisMonthRevenue - thisMonthExpense) / thisMonthRevenue) * 100)
    : 0

  // 3. 往来
  const bills = await listArApBills()
  const upcomingRecv = dueWithin(bills, 'receivable', 30)
  const upcomingPay = dueWithin(bills, 'payable', 30)
  const upcomingReceipts = upcomingRecv.reduce((s, b) => s + (b.amount - b.settled), 0)
  const upcomingPayments = upcomingPay.reduce((s, b) => s + (b.amount - b.settled), 0)

  // 4. 30 天现金流曲线：每天把已知的应收应付累加进余额
  const curve: CashFlowPoint[] = []
  let running = availableFunds
  for (let d = 0; d <= 30; d++) {
    const day = addDays(today(), d)
    const dateStr = fmt(day)
    const inflow = upcomingRecv
      .filter((b) => b.dueDate === dateStr)
      .reduce((s, b) => s + (b.amount - b.settled), 0)
    const outflow = upcomingPay
      .filter((b) => b.dueDate === dateStr)
      .reduce((s, b) => s + (b.amount - b.settled), 0)
    running = running + inflow - outflow
    curve.push({
      date: dateStr,
      daysFromNow: d,
      balance: Math.round(running * 100) / 100,
      inflow,
      outflow,
    })
  }
  const minBalanceIn30d = Math.min(...curve.map((c) => c.balance))

  // 5. 现金跑道：按本月日均支出，现有钱能撑几天
  const dailyBurn = thisMonthExpense / 30
  const cashRunwayDays = dailyBurn > 0 ? Math.round(availableFunds / dailyBurn) : 999

  // 6. 异常提醒
  const alerts: BossAlert[] = []
  const overdueRecv = overdueBills(bills, 'receivable')
  const overdueTotal = overdueRecv.reduce((s, b) => s + (b.amount - b.settled), 0)
  if (overdueTotal > 0) {
    alerts.push({
      level: overdueTotal > 10000 ? 'high' : 'medium',
      title: `有 ¥${overdueTotal.toLocaleString()} 应收款已逾期`,
      detail: `${overdueRecv.length} 笔款超过约定收款日还没收回，建议马上催收。`,
    })
  }
  if (minBalanceIn30d < 0) {
    alerts.push({
      level: 'high',
      title: `按现有节奏，30 天内现金会转负（最低 ¥${minBalanceIn30d.toLocaleString()}）`,
      detail: '应收款不及时回、应付款又要付，会出现资金缺口。建议催收或延后大额支出。',
    })
  } else if (minBalanceIn30d < availableFunds * 0.2) {
    alerts.push({
      level: 'medium',
      title: '30 天后账户余额会降到警戒线以下',
      detail: `最低点约 ¥${minBalanceIn30d.toLocaleString()}，注意安排回款。`,
    })
  }
  if (cashRunwayDays < 60) {
    alerts.push({
      level: cashRunwayDays < 30 ? 'high' : 'medium',
      title: `按当前烧钱速度，现金只够撑 ${cashRunwayDays} 天`,
      detail: '不是账面亏损问题，是现金流问题——小公司死大多因为这个。',
    })
  }

  // 7. Top 欠款客户
  const contactMap = new Map<string, string>()
  const contacts = await db.contacts.toArray()
  contacts.forEach((c) => contactMap.set(c.id, c.name))
  const debtorMap = new Map<string, number>()
  overdueRecv.forEach((b) => {
    debtorMap.set(b.contactId, (debtorMap.get(b.contactId) ?? 0) + (b.amount - b.settled))
  })
  const topDebtors = Array.from(debtorMap.entries())
    .map(([cid, amount]) => ({
      name: contactMap.get(cid) ?? cid,
      amount,
      daysOverdue: 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  return {
    availableFunds,
    thisMonthRevenue,
    thisMonthExpense,
    thisMonthProfit,
    grossMargin,
    upcomingReceipts,
    upcomingPayments,
    minBalanceIn30d,
    cashRunwayDays,
    curve,
    alerts: alerts.sort((a, b) => (a.level === 'high' ? -1 : 1)),
    topDebtors,
  }
}
