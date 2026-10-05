/**
 * 记账 Agent：把一句口语化的业务描述，交给 LLM 解析成借贷平衡的凭证分录草稿。
 *
 * 与本地规则引擎 nlAccountingService 的关系：
 * - 本地规则引擎：离线、零成本、只覆盖 12 类常见业务（兜底）。
 * - 本 Agent：用户配置自己的 API Key 后启用，理解开放域自然语言，复杂业务也能拆分录。
 * - 两者产出结构一致（VoucherEntry[]），最终都要经过 isBalanced 校验才允许保存。
 */
import { chat, extractJson } from '../aiClient'
import type { Account, VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'

export interface BookkeepingResult {
  summary: string
  entries: VoucherEntry[]
  /** 模型自己标注的置信点/存疑处，前端展示给用户人工确认 */
  warnings: string[]
  /** 实际使用的是 LLM 还是本地兜底 */
  engine: 'llm' | 'local'
}

/** 把科目表压缩成模型看得懂的清单（只给末级科目，避免它用非末级） */
function accountsCatalog(accounts: Account[]): string {
  return accounts
    .filter((a) => a.isLeaf && a.status === 'active')
    .map((a) => `${a.code} ${a.name}(${a.type === 'asset' || a.type === 'cost' ? '借' : '贷'}方余额)`)
    .join('\n')
}

const SYSTEM_PROMPT = `你是一名中国小企业会计，负责把老板的口语描述转成借贷记账凭证。
规则：
1. 只能使用我给你的末级科目编码，不要编造科目；科目拿不准就用最接近的，并在 warnings 里说明。
2. 金额单位统一为人民币元；用户说"万/千"要换算成元。
3. 必须借贷平衡：所有分录借方合计 = 贷方合计。
4. 每笔分录只在借方或贷方填一个数，另一侧填 0。
5. 仅输出 JSON，不要任何解释，结构如下：
{
  "summary": "一句话业务摘要",
  "entries": [ {"summary":"摘要","accountCode":"1002","accountName":"银行存款","debit":0,"credit":0} ],
  "warnings": ["拿不准的地方"]
}`

/** 纯解析：把 LLM 返回的文本转成 VoucherEntry[]（可单测，不发网络请求） */
export function parseBookkeepingJson(text: string): { summary: string; entries: VoucherEntry[]; warnings: string[] } {
  const obj = extractJson(text) as {
    summary?: string
    entries?: Array<Partial<VoucherEntry>>
    warnings?: string[]
  }
  const entries: VoucherEntry[] = (obj.entries ?? []).map((e) => ({
    id: uid('e_'),
    summary: e.summary ?? obj.summary ?? '',
    accountCode: String(e.accountCode ?? ''),
    accountName: String(e.accountName ?? ''),
    debit: Math.round(Number(e.debit ?? 0) * 100) / 100,
    credit: Math.round(Number(e.credit ?? 0) * 100) / 100,
  }))
  return {
    summary: obj.summary ?? '',
    entries,
    warnings: obj.warnings ?? [],
  }
}

/** 调用 LLM 完成记账解析；未配置 Key 时由调用方决定是否回退本地规则 */
export async function bookkeepingParse(input: string, accounts: Account[]): Promise<BookkeepingResult> {
  const userMsg = `可用末级科目如下：\n${accountsCatalog(accounts)}\n\n请处理这笔业务：${input}`
  const raw = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    { json: true, temperature: 0.1 },
  )
  const parsed = parseBookkeepingJson(raw)
  const debit = parsed.entries.reduce((s, e) => s + e.debit, 0)
  const credit = parsed.entries.reduce((s, e) => s + e.credit, 0)
  if (Math.abs(debit - credit) > 0.01) {
    parsed.warnings.push(`借贷不平衡：借 ${debit.toFixed(2)} / 贷 ${credit.toFixed(2)}，请人工核对`)
  }
  return { ...parsed, engine: 'llm' }
}
