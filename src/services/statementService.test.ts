import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { getAvailablePeriods, getProfitStatement } from '@/services/statementService'
import type { Account } from '@/types/models'

const acc = (code: string, type: Account['type'], dir: 'debit' | 'credit'): Account => ({
  id: code, code, name: code, parentCode: null, level: 1, type, direction: dir, isLeaf: true, status: 'active',
})

describe('services/statementService 报表', () => {
  beforeEach(async () => { await db.accounts.clear(); await db.vouchers.clear() })

  it('getAvailablePeriods 来自凭证期间', async () => {
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '1001', accountName: '库存现金', debit: 100, credit: 0 }],
      creator: 'u', createdAt: Date.now(), attachments: [],
    })
    expect(await getAvailablePeriods()).toEqual(['2026-03'])
  })

  it('getProfitStatement 计算营业收入与净利润', async () => {
    await db.accounts.bulkAdd([acc('6001', 'profit', 'credit'), acc('6401', 'cost', 'debit'), acc('1001', 'asset', 'debit')])
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [
        { id: 'e1', summary: 's', accountCode: '6001', accountName: '主营业务收入', debit: 0, credit: 2000 },
        { id: 'e2', summary: 's', accountCode: '6401', accountName: '主营业务成本', debit: 800, credit: 0 },
      ],
      creator: 'u', createdAt: Date.now(), attachments: [],
    })
    const ps = await getProfitStatement('2026-03')
    expect(ps.revenue).toBe(2000)
    expect(ps.netProfit).toBe(1200)
  })
})
