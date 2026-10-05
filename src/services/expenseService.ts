import { db } from '@/db/database'
import type { ExpenseClaim, ExpenseItem, ExpenseStatus } from '@/types/models'
import { uid, currentPeriod } from '@/utils/format'
import { addLog } from './logService'
import { saveVoucher } from './voucherService'
import { useUserStore } from '@/store/userStore'

/** 多级审核节点 */
export const EXPENSE_NODES = ['部门经理审批', '财务复核', '总经理审批']

export async function nextClaimNo(): Promise<string> {
  const period = currentPeriod()
  const count = await db.expenseClaims.where('claimNo').startsWith(`BX${period}`).count()
  return `BX${period}-${String(count + 1).padStart(4, '0')}`
}

export interface ExpenseFilter {
  status?: ExpenseStatus
  keyword?: string
}

export async function listExpenseClaims(filter: ExpenseFilter = {}): Promise<ExpenseClaim[]> {
  let list = await db.expenseClaims.toArray()
  if (filter.status) list = list.filter((e) => e.status === filter.status)
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    list = list.filter((e) => e.claimNo.toLowerCase().includes(kw) || e.applicant.toLowerCase().includes(kw))
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}

export async function createExpenseClaim(input: {
  applicant: string
  department: string
  date: string
  items: Omit<ExpenseItem, 'id'>[]
  remark?: string
  attachmentCount?: number
}): Promise<ExpenseClaim> {
  const claimNo = await nextClaimNo()
  const items: ExpenseItem[] = input.items.map((it) => ({ id: uid('ei_'), ...it }))
  const total = items.reduce((s, it) => s + it.amount, 0)
  const claim: ExpenseClaim = {
    id: uid('ec_'),
    claimNo,
    applicant: input.applicant,
    department: input.department,
    date: input.date,
    items,
    total,
    status: 'submitted',
    currentNode: EXPENSE_NODES[0],
    attachmentCount: input.attachmentCount ?? 0,
    remark: input.remark,
    createdAt: Date.now(),
  }
  await db.expenseClaims.add(claim)
  await addLog('提交报销', '费用报销', `提交报销单 ${claimNo} 金额 ¥${total.toFixed(2)}`)
  return claim
}

/** 审核通过：推进到下一节点，末节点则置为已通过 */
export async function approveExpense(id: string) {
  const claim = await db.expenseClaims.get(id)
  if (!claim) throw new Error('报销单不存在')
  const idx = EXPENSE_NODES.indexOf(claim.currentNode)
  if (idx === -1 || idx >= EXPENSE_NODES.length - 1) {
    await db.expenseClaims.update(id, { status: 'approved', currentNode: '已完成', approvedAt: Date.now() })
  } else {
    await db.expenseClaims.update(id, { currentNode: EXPENSE_NODES[idx + 1] })
  }
  await addLog('审核报销', '费用报销', `审核通过 ${claim.claimNo}`)
}

export async function rejectExpense(id: string) {
  const claim = await db.expenseClaims.get(id)
  if (!claim) throw new Error('报销单不存在')
  await db.expenseClaims.update(id, { status: 'rejected', currentNode: '已驳回' })
  await addLog('驳回报销', '费用报销', `驳回 ${claim.claimNo}`)
}

export async function payExpense(id: string) {
  const claim = await db.expenseClaims.get(id)
  if (!claim) throw new Error('报销单不存在')
  let voucherNo = claim.voucherNo
  if (!voucherNo) {
    voucherNo = await generateVoucherForClaim(id)
  }
  await db.expenseClaims.update(id, { status: 'paid', voucherNo })
  await addLog('支付报销', '费用报销', `支付报销单 ${claim.claimNo}`)
}

/** 报销同步账务：自动生成凭证（借费用科目 / 贷库存现金） */
export async function generateVoucherForClaim(id: string): Promise<string> {
  const claim = await db.expenseClaims.get(id)
  if (!claim) throw new Error('报销单不存在')
  if (claim.voucherNo) return claim.voucherNo
  const user = useUserStore.getState().currentUser
  const entries = claim.items.map((it) => ({
    id: uid('e_'),
    summary: `报销-${it.category}`,
    accountCode: it.accountCode || '6602',
    accountName: it.accountCode || '管理费用',
    debit: it.amount,
    credit: 0,
  }))
  entries.push({
    id: uid('e_'),
    summary: `报销-${claim.claimNo}`,
    accountCode: '1001',
    accountName: '库存现金',
    debit: 0,
    credit: claim.total,
  })
  const voucher = await saveVoucher({
    date: new Date().toISOString().slice(0, 10),
    entries,
    remark: `报销单 ${claim.claimNo}`,
    creator: user?.name ?? claim.applicant,
  })
  await db.expenseClaims.update(id, { voucherNo: voucher.voucherNo })
  await addLog('生成凭证', '费用报销', `报销单 ${claim.claimNo} 生成凭证 ${voucher.voucherNo}`)
  return voucher.voucherNo
}
