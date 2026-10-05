/**
 * 业务端"说一句"入口：员工说大白话，系统出凭证草稿 Proposal，等财务批。
 * 这是第三层"业务协同"的核心——业务发生地直接进账，不用跑财务室。
 */
import { parsePlainEntry, type ParsedPlainEntry } from './plainEntryAgent'
import { propose } from './proposalService'
import type { AgentProposal } from '@/types/models'

export interface QuickEntryResult {
  parsed: ParsedPlainEntry
  proposal: AgentProposal
}

/**
 * 员工说一句话 → 出一张待批凭证草稿。
 * 批准后，财务去凭证页确认入账；这里不直接写凭证表。
 */
export async function quickEntry(text: string): Promise<QuickEntryResult> {
  const parsed = await parsePlainEntry(text)
  if (!parsed) {
    throw new Error('没听懂。试试："昨天打车86，微信付的" / "买办公纸320，现金"')
  }
  const directionLabel = parsed.direction === 'income' ? '收入入账'
    : parsed.direction === 'purchase' ? '采购挂账'
    : parsed.direction === 'credit_sale' ? '赊销挂账'
    : '费用报销'
  const proposal = await propose({
    role: 'bookkeeper',
    kind: 'plain_entry',
    title: `建议入账：${directionLabel} ${parsed.categoryName} ¥${parsed.amount.toLocaleString()}`,
    detail: `原文：${parsed.summary}（${parsed.source === 'rule' ? '本地规则识别' : 'AI 识别'}）`,
    payload: parsed,
    confidence: parsed.source === 'rule' ? 0.9 : 0.7,
  })
  return { parsed, proposal }
}
