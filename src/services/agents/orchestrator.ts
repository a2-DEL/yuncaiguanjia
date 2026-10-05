/**
 * 调度员（总会计师 Agent）：
 * 老板只点一下"周度体检"，它自动串起各岗位做一次巡检：
 *   - 经营参谋：现金流、跑道、异常
 *   - 审核主管：未审核凭证、长期挂账
 *   - 税务专员：申报期、免税临界点
 *   - 出纳专员：余额异常
 *
 * 所有发现统一变成 Proposal 进待批箱——人批了才处理。
 * 这是"一个人 + 一个 Key 指挥整个团队"的最小实现。
 */
import { propose, listPendingProposals } from './proposalService'
import { getBossCockpit } from '@/services/bossCockpit'
import { listVouchers } from '@/services/voucherService'
import { auditVouchers } from './auditAgent'
import { db } from '@/db/database'
import { currentPeriod } from '@/utils/format'
import type { AgentProposal } from '@/types/models'

export interface HealthCheckReport {
  checkedAt: number
  findings: number
  proposals: AgentProposal[]
}

/** 跑一次周度体检。幂等：已存在的待批项不重复提。 */
export async function runWeeklyHealthCheck(): Promise<HealthCheckReport> {  const period = currentPeriod()
  const existing = await listPendingProposals()
  const seenTitles = new Set(existing.map((p) => p.title))
  const created: AgentProposal[] = []

  // 1. 经营参谋：现金流风险（来自 bossCockpit）
  const cockpit = await getBossCockpit()
  for (const alert of cockpit.alerts) {
    if (seenTitles.has(alert.title)) continue
    const p = await propose({
      role: 'watcher',
      kind: 'risk_alert',
      title: alert.title,
      detail: alert.detail,
      confidence: alert.level === 'high' ? 0.95 : 0.8,
    })
    created.push(p)
  }

  // 2. 审核主管：未审核凭证
  const vouchers = await listVouchers({ period })
  const unaudited = vouchers.filter((v) => v.status === 'pending' || v.status === 'draft')
  if (unaudited.length > 0) {
    const title = `${unaudited.length} 张凭证尚未审核`
    if (!seenTitles.has(title)) {
      const p = await propose({
        role: 'auditor',
        kind: 'audit_queue',
        title,
        detail: `本期待审/草稿凭证 ${unaudited.length} 张，建议尽快复核后再结账。`,
        confidence: 1,
      })
      created.push(p)
    }
  }

  // 3. 出纳专员：现金跑道告警
  if (cockpit.cashRunwayDays < 60 && cockpit.cashRunwayDays > 0) {
    const title = `现金跑道仅 ${cockpit.cashRunwayDays} 天`
    if (!seenTitles.has(title)) {
      const p = await propose({
        role: 'cashier',
        kind: 'cash_runway',
        title,
        detail: `按本月日均支出 ¥${Math.round(cockpit.thisMonthExpense / 30).toLocaleString()} 计算，现有资金约可支撑 ${cockpit.cashRunwayDays} 天。`,
        confidence: 0.85,
      })
      created.push(p)
    }
  }

  // 3.5 审核主管：配了 AI 就扫一遍近期凭证找问题（没配 Key 静默跳过）
  try {
    const recent = vouchers.filter((v) => v.status === 'audited').slice(0, 30)
    if (recent.length > 0) {
      const report = await auditVouchers(recent)
      for (const f of report.findings.slice(0, 5)) {
        const title = `凭证 ${f.voucherNo}：${f.issue}`
        if (seenTitles.has(title)) continue
        const p = await propose({
          role: 'auditor',
          kind: 'audit_finding',
          title,
          detail: `${f.suggestion}（AI 审核，置信度 ${f.severity}）`,
          confidence: f.severity === 'high' ? 0.9 : 0.7,
        })
        created.push(p)
      }
    }
  } catch {
    // 没配 Key 或调用失败：跳过，不影响其他体检
  }

  // 4. 税务专员：小规模纳税人季度 30 万免税临界点提醒
  //    统计本季度（自然季）已审核凭证里的主营业务收入合计
  const now = new Date()
  const qStartMonth = Math.floor(now.getMonth() / 3) * 3 + 1 // 1/4/7/10
  const qStart = `${now.getFullYear()}-${String(qStartMonth).padStart(2, '0')}`
  const allAudited = await db.vouchers.where('status').equals('audited').toArray()
  let quarterRevenue = 0
  for (const v of allAudited) {
    if (!v.period.startsWith(`${now.getFullYear()}-`) ) continue
    const m = Number(v.period.split('-')[1])
    if (m < qStartMonth) continue
    for (const e of v.entries) {
      if (e.accountCode.startsWith('6001')) quarterRevenue += e.credit
    }
  }
  const TAX_FREE_LIMIT = 300000
  if (quarterRevenue > TAX_FREE_LIMIT * 0.8) {
    const remain = TAX_FREE_LIMIT - quarterRevenue
    const title = remain >= 0
      ? `本季已开票 ¥${quarterRevenue.toLocaleString()}，距小规模免税线还差 ¥${remain.toLocaleString()}`
      : `本季已开票 ¥${quarterRevenue.toLocaleString()}，已超小规模免税线 ¥${Math.abs(remain).toLocaleString()}`
    if (!seenTitles.has(title)) {
      const p = await propose({
        role: 'taxer',
        kind: 'tax_threshold',
        title,
        detail: remain >= 0
          ? `小规模纳税人季度销售额 30 万以内免征增值税。本季已确认收入 ¥${quarterRevenue.toLocaleString()}，再开 ¥${remain.toLocaleString()} 就要全额交税了，注意节奏。`
          : `本季已超过季度 30 万免税额度，超出部分需按 1%（当前优惠征收率）缴纳增值税，建议提前预留税款。`,
        confidence: 0.95,
      })
      created.push(p)
    }
  }

  return {
    checkedAt: Date.now(),
    findings: created.length,
    proposals: created,
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 打开驾驶舱时调用：距上次体检超 7 天就自动跑一次，不用人记得点 */
export async function maybeAutoRunHealthCheck(): Promise<{ ran: boolean; findings?: number }> {
  const last = Number((await db.settings.get('lastHealthCheckAt'))?.value ?? 0)
  if (Date.now() - last < WEEK_MS) return { ran: false }
  const r = await runWeeklyHealthCheck()
  await db.settings.put({ key: 'lastHealthCheckAt', value: String(Date.now()) })
  return { ran: true, findings: r.findings }
}
