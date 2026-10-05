/**
 * 待批 Proposal：Agent 产出的"数字员工工单"，人不批就不落库。
 * 这是整个 Agent 团队的人审闸门——AI 是参谋，不是签字人。
 */
import { db } from '@/db/database'
import { uid } from '@/utils/format'
import { addLog } from '@/services/logService'
import { saveVoucher, type VoucherInput } from '@/services/voucherService'
import { useUserStore } from '@/store/userStore'
import type { AgentProposal, AgentRoleKey, VoucherEntry } from '@/types/models'

/** Agent 提出一个建议（落库为 pending，等人批） */
export async function propose(input: {
  role: AgentRoleKey
  kind: string
  title: string
  detail: string
  payload?: unknown
  confidence?: number
}): Promise<AgentProposal> {
  const row: AgentProposal = {
    id: uid('prop_'),
    role: input.role,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    payload: input.payload,
    status: 'pending',
    confidence: input.confidence ?? 0.7,
    createdAt: Date.now(),
  }
  await db.proposals.add(row)
  await addLog('Agent 提议', 'AI 助手', `${input.title}`)
  return row
}

export async function listPendingProposals(): Promise<AgentProposal[]> {
  const all = await db.proposals.orderBy('createdAt').reverse().toArray()
  return all.filter((p) => p.status === 'pending')
}

export async function listAllProposals(limit = 100): Promise<AgentProposal[]> {
  return db.proposals.orderBy('createdAt').reverse().limit(limit).toArray()
}

/** 把 payMethod 字符串拆成科目 code/name */
function parsePayMethod(pm: string): { code: string; name: string } {
  if (pm.startsWith('1001')) return { code: '1001', name: '库存现金' }
  if (pm.startsWith('1002')) return { code: '1002', name: '银行存款' }
  if (pm.startsWith('1122')) return { code: '1122', name: '应收账款' }
  if (pm.startsWith('2202')) return { code: '2202', name: '应付账款' }
  if (pm.includes('微信')) return { code: '1012.01', name: '其他货币资金-微信' }
  if (pm.includes('支付宝')) return { code: '1012.02', name: '其他货币资金-支付宝' }
  return { code: '1001', name: '库存现金' }
}

/** 人批准：标记为已批。对 plain_entry 类 Proposal，同时生成凭证草稿。 */
export async function approveProposal(id: string): Promise<{ voucherNo?: string; voucherId?: string }> {
  const me = useUserStore.getState().currentUser?.name ?? '系统'
  const row = await db.proposals.get(id)
  if (!row) return {}

  let voucherNo: string | undefined
  let voucherId: string | undefined
  if (row.kind === 'plain_entry' && row.payload) {
    const p = row.payload as {
      amount: number; direction?: string; categoryCode: string; categoryName: string; payMethod: string; summary: string
    }
    const other = parsePayMethod(p.payMethod)
    let entries: VoucherEntry[]
    if (p.direction === 'income') {
      // 客户打款：借银行/现金，贷主营业务收入
      entries = [
        { id: uid('e_'), summary: p.summary, accountCode: other.code, accountName: other.name, debit: p.amount, credit: 0 },
        { id: uid('e_'), summary: p.summary, accountCode: p.categoryCode, accountName: p.categoryName, debit: 0, credit: p.amount },
      ]
    } else {
      // 费用 / 进货：借费用或库存，贷现金/应付
      entries = [
        { id: uid('e_'), summary: p.summary, accountCode: p.categoryCode, accountName: p.categoryName, debit: p.amount, credit: 0 },
        { id: uid('e_'), summary: p.summary, accountCode: other.code, accountName: other.name, debit: 0, credit: p.amount },
      ]
    }
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const input: VoucherInput = {
      date,
      entries,
      creator: me,
      remark: `由「说一句就记账」生成，Proposal ${row.id}`,
    }
    const v = await saveVoucher(input)
    voucherNo = v.voucherNo
    voucherId = v.id
    await addLog('AI 提议转凭证', 'AI 助手', `${row.title} → ${v.voucherNo}`)
  }

  await db.proposals.update(id, { status: 'approved', decidedAt: Date.now(), decidedBy: me })
  await addLog('批准 Agent 提议', 'AI 助手', `批准 ${id}${voucherNo ? `（凭证 ${voucherNo}）` : ''}`)
  return { voucherNo, voucherId }
}

export async function rejectProposal(id: string): Promise<void> {
  const me = useUserStore.getState().currentUser?.name ?? '系统'
  await db.proposals.update(id, { status: 'rejected', decidedAt: Date.now(), decidedBy: me })
  await addLog('驳回 Agent 提议', 'AI 助手', `驳回 ${id}`)
}

export async function countPending(): Promise<number> {
  return db.proposals.where('status').equals('pending').count()
}
