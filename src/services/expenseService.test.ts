import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { createExpenseClaim, approveExpense, EXPENSE_NODES, generateVoucherForClaim } from '@/services/expenseService'

describe('services/expenseService 费用报销', () => {
  beforeEach(async () => { await db.expenseClaims.clear(); await db.vouchers.clear() })

  it('createExpenseClaim 生成单号与状态', async () => {
    const c = await createExpenseClaim({ applicant: '张三', department: '销售', date: '2026-03-01', items: [{ category: '差旅', amount: 500, accountCode: '6602', summary: '出差' }], remark: '' })
    expect(c.status).toBe('submitted')
    expect(c.currentNode).toBe(EXPENSE_NODES[0])
    expect(c.claimNo.startsWith('BX')).toBe(true)
  })

  it('approveExpense 推进至末节点置为已通过', async () => {
    const c = await createExpenseClaim({ applicant: '张三', department: '销售', date: '2026-03-01', items: [{ category: '差旅', amount: 500, accountCode: '6602', summary: '出差' }], remark: '' })
    for (let i = 0; i < EXPENSE_NODES.length; i++) await approveExpense(c.id)
    const after = await db.expenseClaims.get(c.id)
    expect(after?.status).toBe('approved')
  })

  it('generateVoucherForClaim 生成凭证并回写', async () => {
    const c = await createExpenseClaim({ applicant: '张三', department: '销售', date: '2026-03-01', items: [{ category: '差旅', amount: 500, accountCode: '6602', summary: '出差' }], remark: '' })
    const no = await generateVoucherForClaim(c.id)
    expect(no).toBeTruthy()
    const after = await db.expenseClaims.get(c.id)
    expect(after?.voucherNo).toBe(no)
    const v = (await db.vouchers.where('voucherNo').equals(no).toArray())[0]
    expect(v.entries.reduce((s, e) => s + e.credit, 0)).toBe(500)
  })
})
