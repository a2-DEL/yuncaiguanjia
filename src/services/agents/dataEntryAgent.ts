/**
 * 数据录入 Agent：把一段口语描述转成结构化字段，帮用户少填表。
 * 例如：「张三公司，电话13800001111，我们欠它货款5000」
 *   -> 识别为往来单位+应付单据，抽出 name/phone/amount/direction 等字段。
 * 它只"抽取+建议"，不直接写库；用户在页面确认后再落库。
 */
import { chat, extractJson } from '../aiClient'

export type EntryKind = 'contact' | 'expense' | 'invoice' | 'unknown'

export interface EntrySuggestion {
  kind: EntryKind
  /** 抽取到的字段（键值由具体业务决定，如 name/phone/amount/date/taxNo） */
  fields: Record<string, string | number>
  /** 给用户的一句说明 */
  suggestion: string
}

const SYSTEM_PROMPT = `你是财务数据录入助手。把用户的一句话解析成结构化字段。
判断意图类型 kind：
- contact：提到客户/供应商/往来单位（公司名、联系人、电话、税号）
- expense：提到报销/费用/出差/餐饮/打车
- invoice：提到发票（进项/销项、发票号、税额）
- unknown：无法判断
仅输出 JSON：{"kind":"contact|expense|invoice|unknown","fields":{"字段名":"值"},"suggestion":"下一步该填哪个表单"}`

/** 纯解析（可单测） */
export function parseEntryJson(text: string): EntrySuggestion {
  const obj = extractJson(text) as {
    kind?: EntryKind
    fields?: Record<string, string | number>
    suggestion?: string
  }
  return {
    kind: obj.kind && ['contact', 'expense', 'invoice', 'unknown'].includes(obj.kind) ? obj.kind : 'unknown',
    fields: obj.fields ?? {},
    suggestion: obj.suggestion ?? '',
  }
}

export async function suggestEntry(input: string): Promise<EntrySuggestion> {
  const raw = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input },
    ],
    { json: true, temperature: 0.1 },
  )
  return parseEntryJson(raw)
}
