import { db } from '@/db/database'
import type { Account, AccountType } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from '@/services/logService'

export interface TemplateAccount {
  code: string
  name: string
  type: AccountType
  direction: 'debit' | 'credit'
}

export interface AccountTemplate {
  id: string
  name: string
  description: string
  accounts: TemplateAccount[]
}

/** 行业科目模板（轻量预设，可后续扩展更多行业） */
export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  {
    id: 'retail',
    name: '零售小店',
    description: '适用于便利店/网店：含进销存与常见费用',
    accounts: [
      { code: '1001', name: '库存现金', type: 'asset', direction: 'debit' },
      { code: '1002', name: '银行存款', type: 'asset', direction: 'debit' },
      { code: '1122', name: '应收账款', type: 'asset', direction: 'debit' },
      { code: '1405', name: '库存商品', type: 'asset', direction: 'debit' },
      { code: '2202', name: '应付账款', type: 'liability', direction: 'credit' },
      { code: '2211', name: '应付职工薪酬', type: 'liability', direction: 'credit' },
      { code: '2221', name: '应交税费', type: 'liability', direction: 'credit' },
      { code: '6001', name: '主营业务收入', type: 'profit', direction: 'credit' },
      { code: '6401', name: '主营业务成本', type: 'profit', direction: 'debit' },
      { code: '6601', name: '销售费用', type: 'profit', direction: 'debit' },
      { code: '6602', name: '管理费用', type: 'profit', direction: 'debit' },
    ],
  },
  {
    id: 'service',
    name: '服务工作室',
    description: '适用于咨询/设计：轻资产、以费用与收入为主',
    accounts: [
      { code: '1001', name: '库存现金', type: 'asset', direction: 'debit' },
      { code: '1002', name: '银行存款', type: 'asset', direction: 'debit' },
      { code: '1122', name: '应收账款', type: 'asset', direction: 'debit' },
      { code: '2202', name: '应付账款', type: 'liability', direction: 'credit' },
      { code: '2211', name: '应付职工薪酬', type: 'liability', direction: 'credit' },
      { code: '2221', name: '应交税费', type: 'liability', direction: 'credit' },
      { code: '6001', name: '主营业务收入', type: 'profit', direction: 'credit' },
      { code: '6602', name: '管理费用', type: 'profit', direction: 'debit' },
      { code: '6603', name: '财务费用', type: 'profit', direction: 'debit' },
    ],
  },
]

/** 应用行业科目模板：仅新增模板中不存在的科目，返回新增数量 */
export async function applyTemplate(templateId: string): Promise<number> {
  const tpl = ACCOUNT_TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) throw new Error('模板不存在')
  const existing = await db.accounts.toArray()
  const existingCodes = new Set(existing.map((a) => a.code))
  let added = 0
  for (const a of tpl.accounts) {
    if (existingCodes.has(a.code)) continue
    const acc: Account = {
      id: uid('a_'), code: a.code, name: a.name, parentCode: null, level: 1, type: a.type, direction: a.direction,
      isLeaf: true, status: 'active',
    }
    await db.accounts.add(acc)
    added++
  }
  if (added > 0) await addLog('应用科目模板', '科目体系', `应用模板「${tpl.name}」，新增 ${added} 个科目`)
  return added
}
