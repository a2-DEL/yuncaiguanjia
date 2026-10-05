/**
 * 经营参谋 Agent：看全局数据，给老板一句人话建议。
 *
 * 设计原则：
 * - 数字都是本地算好的（getBossCockpit），这个 Agent 只负责"解释"。
 * - 没配 API Key 时，降级到纯规则模板，保证老板始终能看到一句话诊断。
 * - 置信度低于阈值时，明确说"建议找会计复核"。
 */
import { chat, extractJson, AiNotConfiguredError } from '../aiClient'
import type { BossCockpit } from '@/services/bossCockpit'

export interface BossInsight {
  summary: string        // 一句话诊断（老板看得懂）
  advice: string[]      // 2-3 条具体建议
  source: 'llm' | 'rule' // 区分是大模型说的还是本地规则
}

/** 纯规则版：不依赖 LLM，永远可用 */
function ruleBasedInsight(data: BossCockpit): BossInsight {
  const lines: string[] = []
  if (data.thisMonthProfit >= 0) {
    lines.push(`本月盈利 ¥${data.thisMonthProfit.toLocaleString()}，毛利率 ${data.grossMargin}%。`)
  } else {
    lines.push(`本月亏损 ¥${Math.abs(data.thisMonthProfit).toLocaleString()}，主要看是收入掉了还是成本涨了。`)
  }
  if (data.minBalanceIn30d < 0) {
    lines.push('按目前节奏，一个月内现金会转负——这是最该警惕的事。')
  } else if (data.cashRunwayDays < 60) {
    lines.push(`现金只够撑约 ${data.cashRunwayDays} 天，注意控制支出。`)
  }
  if (data.alerts.length === 0) {
    lines.push('目前没有明显异常。')
  } else {
    lines.push(`有 ${data.alerts.length} 条预警需要你看一眼。`)
  }
  return {
    summary: lines.join(''),
    advice: data.alerts.slice(0, 3).map((a) => a.title),
    source: 'rule',
  }
}

/** LLM 版：让模型基于数字给人话建议。失败自动降级 */
export async function getBossInsight(data: BossCockpit): Promise<BossInsight> {
  const prompt = `你是一个小企业的财务顾问。基于以下老板视角的数据，用大白话给老板一句诊断（不超过 80 字），并给 2-3 条可执行建议。不要堆砌专业术语。

数据：
- 可动用资金：¥${data.availableFunds.toLocaleString()}
- 本月收入：¥${data.thisMonthRevenue.toLocaleString()}
- 本月支出：¥${data.thisMonthExpense.toLocaleString()}
- 本月利润：¥${data.thisMonthProfit.toLocaleString()}，毛利率 ${data.grossMargin}%
- 30 天内预计回款：¥${data.upcomingReceipts.toLocaleString()}
- 30 天内预计要付：¥${data.upcomingPayments.toLocaleString()}
- 30 天内现金最低点：¥${data.minBalanceIn30d.toLocaleString()}
- 现金跑道：${data.cashRunwayDays} 天
- 已识别风险：${data.alerts.map((a) => a.title).join('；') || '无'}

只输出 JSON：{"summary":"...","advice":["...","..."]}`

  try {
    const raw = await chat([
      { role: 'system', content: '你是小企业老板的财务顾问，用大白话回答，不堆术语。只输出 JSON。' },
      { role: 'user', content: prompt },
    ], { json: true })
    const parsed = extractJson(raw) as { summary?: string; advice?: string[] }
    if (!parsed.summary) return ruleBasedInsight(data)
    return {
      summary: parsed.summary,
      advice: Array.isArray(parsed.advice) ? parsed.advice : [],
      source: 'llm',
    }
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return ruleBasedInsight(data)
    return ruleBasedInsight(data)
  }
}
