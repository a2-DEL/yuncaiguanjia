import type { Account, VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'

/**
 * 自然语言记账：本地规则引擎（离线、无需 Key/网络）。
 * 解析中文记账语句中的「金额 + 业务类型 + 借贷科目」，产出凭证分录草稿。
 * 仅支持单借单贷的简单业务；无法识别时返回 warnings，由用户在界面确认/微调。
 *
 * 注意：这是确定性规则引擎，不是大模型。旨在降低非财人员的录入门槛。
 */

export interface NlParseResult {
  summary: string
  entries: VoucherEntry[]
  warnings: string[]
}

const FACTOR: Record<string, number> = { 万: 10000, 千: 1000, 百: 100 }

/** 从文本中提取金额（支持 万/千/百 单位与千分位逗号），返回第一个匹配的金额 */
export function extractAmount(text: string): number | null {
  const re = /(\d[\d,]*\.?\d*)\s*(万|千|百)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const num = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isNaN(num)) continue
    const unit = m[2] as keyof typeof FACTOR | undefined
    const value = unit ? num * FACTOR[unit] : num
    if (value > 0) return Math.round(value * 100) / 100
  }
  return null
}

interface AccountRef { code: string; name: string; found: boolean }

/** 在科目表中按名称/编码前缀解析科目（优先末级科目） */
export function resolveAccount(keyword: string, accounts: Account[]): AccountRef {
  const leaf = accounts.filter((a) => a.isLeaf)
  const byName = leaf.find((a) => a.name.includes(keyword))
  if (byName) return { code: byName.code, name: byName.name, found: true }
  const byCode = leaf.find((a) => a.code.startsWith(keyword))
  if (byCode) return { code: byCode.code, name: byCode.name, found: true }
  return { code: keyword, name: keyword, found: false }
}

interface EntrySpec { keyword: string; direction: 'debit' | 'credit' }
interface Template { name: string; match: string[]; summary: string; entries: EntrySpec[] }

const TEMPLATES: Template[] = [
  { name: '工资薪酬', match: ['发工资', '工资', '薪资', '薪酬', '发薪', '薪金'], summary: '计提/发放工资', entries: [{ keyword: '应付职工薪酬', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '报销费用', match: ['报销', '报账'], summary: '费用报销', entries: [{ keyword: '差旅费', direction: 'debit' }, { keyword: '库存现金', direction: 'credit' }] },
  { name: '采购', match: ['采购', '购买', '购进', '买'], summary: '采购付款', entries: [{ keyword: '库存商品', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '销售收入', match: ['收入', '收款', '销售', '营收', '货款', '收回', '收到'], summary: '销售收入', entries: [{ keyword: '银行存款', direction: 'debit' }, { keyword: '主营业务收入', direction: 'credit' }] },
  { name: '借款', match: ['借款', '贷款', '借入'], summary: '取得借款', entries: [{ keyword: '银行存款', direction: 'debit' }, { keyword: '短期借款', direction: 'credit' }] },
  { name: '收利息', match: ['收利息', '利息收入'], summary: '收到利息', entries: [{ keyword: '银行存款', direction: 'debit' }, { keyword: '利息收入', direction: 'credit' }] },
  { name: '付利息', match: ['付利息', '利息支出'], summary: '支付利息', entries: [{ keyword: '利息支出', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '房租', match: ['房租', '租金', '租赁'], summary: '支付房租', entries: [{ keyword: '租赁费', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '缴税', match: ['缴税', '交税', '缴纳增值税', '所得税', '税款'], summary: '缴纳税费', entries: [{ keyword: '应交税费', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '提现', match: ['提现', '取现', '取现金'], summary: '提取现金', entries: [{ keyword: '库存现金', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
  { name: '存现', match: ['存现', '存入现金', '现金存入'], summary: '存入现金', entries: [{ keyword: '银行存款', direction: 'debit' }, { keyword: '库存现金', direction: 'credit' }] },
  { name: '还款', match: ['还款', '偿还', '还贷'], summary: '偿还借款', entries: [{ keyword: '短期借款', direction: 'debit' }, { keyword: '银行存款', direction: 'credit' }] },
]

/** 解析自然语言记账语句 */
export function parseNlSentence(text: string, accounts: Account[]): NlParseResult {
  const warnings: string[] = []
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return { summary: '', entries: [], warnings: ['请输入记账描述'] }
  }

  const amount = extractAmount(trimmed)
  if (amount == null) warnings.push('未识别到金额，请补充数字（如「5万」「1200」）')

  const tpl = TEMPLATES.find((t) => t.match.some((k) => trimmed.includes(k)))
  if (!tpl) warnings.push('未匹配到业务类型，请用更明确的关键词（如「发工资」「销售收入」「报销」）')

  const entries: VoucherEntry[] = []
  if (amount != null && tpl) {
    for (const spec of tpl.entries) {
      const ref = resolveAccount(spec.keyword, accounts)
      if (!ref.found) warnings.push(`未找到科目「${spec.keyword}」，请先在会计科目中维护或手动修改`)
      entries.push({
        id: uid('e_'),
        summary: tpl.summary,
        accountCode: ref.code,
        accountName: ref.name,
        debit: spec.direction === 'debit' ? amount : 0,
        credit: spec.direction === 'credit' ? amount : 0,
      })
    }
  }

  return { summary: tpl ? `${tpl.summary} ${amount ?? ''}` : '', entries, warnings }
}

/**
 * 发票 OCR 接口占位（规划待确认项）。
 * 真实实现需接入 OCR 服务；此处仅定义契约，返回待定提示。
 */
export interface InvoiceOcrResult {
  available: false
  message: string
}
export function parseInvoiceImage(_file: File): InvoiceOcrResult {
  return { available: false, message: '发票 OCR 引擎尚未接入（规划待确认项），当前请使用自然语言或手动录入' }
}
