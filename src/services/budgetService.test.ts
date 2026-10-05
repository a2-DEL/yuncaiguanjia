import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { saveBudget, getBudgetComparison, listBudgets } from '@/services/budgetService'
import type { Account } from '@/types/models'

const acc = (code: string, type: Account['type'], dir: 'debit' | 'credit'): Account => ({
  id: code, code, name: code, parentCode: null, level: 1, type, direction: dir, isLeaf: true, status: 'active',
})

describe('services/budgetService 预算', () => {
  beforeEach(async () => {
    await db.accounts.clear(); await db.budgets.clear(); await db.vouchers.clear()
    await db.accounts.bulkAdd([acc('6001', 'profit', 'credit')])
  })

  it('saveBudget 按 维度+科目 幂等', async () => {
    await saveBudget({ periodType: 'month', period: '2026-03', year: 2026, accountCode: '6001', accountName: '主营业务收入', amount: 1000 })
    await saveBudget({ periodType: 'month', period: '2026-03', year: 2026, accountCode: '6001', accountName: '主营业务收入', amount: 2000 })
    const list = await listBudgets('month', '2026-03')
    expect(list.length).toBe(1)
    expect(list[0].amount).toBe(2000)
  })

  it('getBudgetComparison 计算实际与超支', async () => {
    await saveBudget({ periodType: 'month', period: '2026-03', year: 2026, accountCode: '6001', accountName: '主营业务收入', amount: 1000 })
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '6001', accountName: '主营业务收入', debit: 0, credit: 1500 }],
      creator: 'u', createdAt: Date.now(), attachments: [],
    })
    const rows = await getBudgetComparison({ periodType: 'month', period: '2026-03', year: 2026 })
    const r = rows.find((x) => x.accountCode === '6001')!
    expect(r.actual).toBe(1500)
    expect(r.status).toBe('over')
    expect(r.variance).toBe(-500)
  })
})
