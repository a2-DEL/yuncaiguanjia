/**
 * 老板问答：把老板的大白话问题，翻译成对数据的查询，直接给答案。
 * 优先本地规则（零 token）；答不上来再调 LLM。
 */
import { chat, extractJson, AiNotConfiguredError } from '../aiClient'
import type { BossCockpit } from '@/services/bossCockpit'

export interface BossAnswer {
  text: string
  source: 'rule' | 'llm'
}

/** 本地规则匹配：常见问题直接答 */
function ruleBasedAnswer(q: string, d: BossCockpit): BossAnswer | null {
  const s = q.toLowerCase()

  if (/赚|利润|这个月赚|盈利/.test(s)) {
    return {
      text: `这个月收入 ¥${d.thisMonthRevenue.toLocaleString()}，支出 ¥${d.thisMonthExpense.toLocaleString()}，利润 ${d.thisMonthProfit >= 0 ? '盈利' : '亏损'} ¥${Math.abs(d.thisMonthProfit).toLocaleString()}，毛利率 ${d.grossMargin}%。`,
      source: 'rule',
    }
  }
  if (/欠钱|应收|哪个客户|谁欠/.test(s)) {
    if (d.topDebtors.length === 0) return { text: '目前没有应收逾期，账挺干净。', source: 'rule' }
    const top = d.topDebtors[0]
    return {
      text: `欠钱最多的是 ${top.name}，欠 ¥${top.amount.toLocaleString()}。逾期客户共 ${d.topDebtors.length} 家。`,
      source: 'rule',
    }
  }
  if (/能撑|还能活|现金|跑道|断|够不够/.test(s)) {
    return {
      text: `账上还有 ¥${d.availableFunds.toLocaleString()}，按这个月花钱速度，大概能撑 ${d.cashRunwayDays} 天。30 天内最低会到 ¥${d.minBalanceIn30d.toLocaleString()}。`,
      source: 'rule',
    }
  }
  if (/税|交多少税|发票|免税/.test(s)) {
    return {
      text: `税务提醒已在风险面板里。季度开票额接近 30 万小规模免税线时会自动弹窗。`,
      source: 'rule',
    }
  }
  if (/风险|问题|注意|异常/.test(s)) {
    if (d.alerts.length === 0) return { text: '目前没有明显异常。', source: 'rule' }
    return {
      text: `有 ${d.alerts.length} 条要注意：${d.alerts.map((a) => a.title).join('；')}。`,
      source: 'rule',
    }
  }
  return null
}

/** LLM 兜底：把数字和问题一起塞给模型 */
async function llmAnswer(q: string, d: BossCockpit): Promise<BossAnswer> {
  try {
    const raw = await chat(
      [
        { role: 'system', content: '你是小企业老板的财务顾问。根据给出的数据用大白话回答老板的问题，不要超过 100 字。只输出 JSON {"text":"..."}。' },
        { role: 'user', content: `问题：${q}\n数据：可用资金 ${d.availableFunds}，本月收入 ${d.thisMonthRevenue}，本月支出 ${d.thisMonthExpense}，本月利润 ${d.thisMonthProfit}，毛利率 ${d.grossMargin}%，现金跑道 ${d.cashRunwayDays} 天，30天最低余额 ${d.minBalanceIn30d}，风险 ${d.alerts.map((a) => a.title).join('；')}` },
      ],
      { json: true, temperature: 0.3 },
    )
    const obj = extractJson(raw) as { text?: string }
    if (obj.text) return { text: obj.text, source: 'llm' }
  } catch (e) {
    if (!(e instanceof AiNotConfiguredError)) {
      // 其他错误降级
    }
  }
  return { text: '这个问题我还答不上来，可以点周度体检看看。', source: 'rule' }
}

export async function askBoss(q: string, data: BossCockpit): Promise<BossAnswer> {
  const rule = ruleBasedAnswer(q, data)
  if (rule) return rule
  return llmAnswer(q, data)
}
