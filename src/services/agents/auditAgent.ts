/**
 * 审核 Agent：扮演"财务主管/内审"，对一批凭证做合规性与合理性检查，输出问题清单。
 * 它不替人改凭证，只提问题（科目用错、金额异常、摘要缺失、长期挂账等），由人决定是否调整。
 */
import { chat, extractJson } from '../aiClient'
import type { Voucher } from '@/types/models'

export interface AuditFinding {
  severity: 'high' | 'medium' | 'low'
  voucherNo: string
  issue: string
  suggestion: string
}

export interface AuditReport {
  summary: string
  findings: AuditFinding[]
}

const SYSTEM_PROMPT = `你是资深中国注册会计师，正在复核小企业的记账凭证。
只找真问题，不要为了凑数硬挑。重点检查：
1. 科目使用是否恰当（如把收入挂到负债、把资本性支出直接进费用）。
2. 借贷是否平衡、金额是否明显异常（如整数大额、尾数怪异）。
3. 摘要是否清晰可查。
4. 附件/审核状态是否符合内控。
仅输出 JSON：{"summary":"总体结论一两句","findings":[{"severity":"high|medium|low","voucherNo":"凭证号","issue":"问题","suggestion":"建议"}]}。无问题则 findings 为空数组。`

/** 纯解析 LLM 输出（可单测） */
export function parseAuditJson(text: string): AuditReport {
  const obj = extractJson(text) as { summary?: string; findings?: Partial<AuditFinding>[] }
  const findings: AuditFinding[] = (obj.findings ?? [])
    .filter((f) => f && f.voucherNo)
    .map((f) => ({
      severity: (f.severity as AuditFinding['severity']) ?? 'medium',
      voucherNo: String(f.voucherNo),
      issue: String(f.issue ?? ''),
      suggestion: String(f.suggestion ?? ''),
    }))
  return { summary: obj.summary ?? '', findings }
}

/** 把凭证列表压缩成给模型看的精简文本（避免上下文过长） */
function compactVouchers(vouchers: Voucher[]): string {
  return vouchers
    .slice(0, 50) // 一次最多审 50 张，控制 token
    .map((v) => {
      const lines = v.entries.map((e) => `  ${e.accountCode} ${e.accountName} 借${e.debit} 贷${e.credit} ${e.summary}`).join('\n')
      return `凭证 ${v.voucherNo} 日期 ${v.date} 状态 ${v.status}\n${lines}`
    })
    .join('\n---\n')
}

export async function auditVouchers(vouchers: Voucher[]): Promise<AuditReport> {
  if (vouchers.length === 0) return { summary: '没有可审核的凭证', findings: [] }
  const raw = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请复核以下 ${vouchers.length} 张凭证：\n${compactVouchers(vouchers)}` },
    ],
    { json: true, temperature: 0.1 },
  )
  return parseAuditJson(raw)
}
