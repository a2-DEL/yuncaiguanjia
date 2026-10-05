/**
 * What-If 经营沙盘：让老板在系统里"试错"。
 * 基于本月真实数据做线性外推，不调 LLM，秒出结果。
 */
import type { BossCockpit } from '@/services/bossCockpit'

export interface WhatIfScenario {
  key: string
  label: string
  desc: string
  newProfit: number
  profitDelta: number
  newRunwayDays: number
  verdict: string       // 一句话结论
}

/** 假设工资占总支出约 25%（小生意常见比例） */
const WAGE_SHARE = 0.25

export function runWhatIf(data: BossCockpit, scenario: string): WhatIfScenario {
  const revenue = data.thisMonthRevenue
  const expense = data.thisMonthExpense
  const profit = data.thisMonthProfit
  const cash = data.availableFunds

  if (scenario === 'raise10') {
    // 涨薪 10%：支出增加 = 支出 * 工资占比 * 10%
    const extra = expense * WAGE_SHARE * 0.1
    const newProfit = profit - extra
    const newExpense = expense + extra
    const runway = newExpense > 0 ? Math.round(cash / (newExpense / 30)) : 999
    return {
      key: 'raise10',
      label: '全员涨薪 10%',
      desc: `工资按总支出 ${Math.round(WAGE_SHARE * 100)}% 估算`,
      newProfit,
      profitDelta: -extra,
      newRunwayDays: runway,
      verdict: newProfit > 0 ? `每月少赚 ¥${Math.round(extra).toLocaleString()}，仍盈利` : `每月多亏 ¥${Math.round(Math.abs(newProfit)).toLocaleString()}，不建议`,
    }
  }

  if (scenario === 'delay30') {
    // 客户拖款 30 天：相当于本月收入晚 30 天到，现金少一笔 = revenue
    const newCash = cash - revenue
    const runway = expense > 0 ? Math.round(newCash / (expense / 30)) : 999
    return {
      key: 'delay30',
      label: '最大客户拖款 30 天',
      desc: `本月收入 ¥${revenue.toLocaleString()} 全延后到账`,
      newProfit: profit,
      profitDelta: 0,
      newRunwayDays: runway,
      verdict: runway < 30 ? `⚠️ 现金会断（跑道 ${runway} 天）` : `跑道降到 ${runway} 天，可撑`,
    }
  }

  if (scenario === 'discount10') {
    // 打 9 折：收入 *0.9，成本不变
    const newRevenue = revenue * 0.9
    const newProfit = newRevenue - expense
    const runway = expense > 0 ? Math.round(cash / (expense / 30)) : 999
    return {
      key: 'discount10',
      label: '全场打 9 折促销',
      desc: `收入降 10%，成本不变`,
      newProfit,
      profitDelta: newProfit - profit,
      newRunwayDays: runway,
      verdict: newProfit > 0 ? `利润降到 ¥${Math.round(newProfit).toLocaleString()}，看销量涨不涨得回来` : '打折后亏损，别打',
    }
  }

  return {
    key: scenario, label: scenario, desc: '', newProfit: profit, profitDelta: 0,
    newRunwayDays: data.cashRunwayDays, verdict: '',
  }
}

export const WHAT_IF_PRESETS = [
  { key: 'raise10', label: '涨薪 10%', icon: '💰' },
  { key: 'delay30', label: '客户拖款 30 天', icon: '⏳' },
  { key: 'discount10', label: '打 9 折促销', icon: '🏷️' },
]
