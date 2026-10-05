import { describe, it, expect, beforeEach } from 'vitest'
import { getTranslationDifference } from '@/services/ledgerService'
import { db } from '@/db/database'

describe('ledgerService 折算差异报表', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    await db.vouchers.clear()
    await db.exchangeRates.clear()
    await db.accounts.add({ id: 'b1', code: '1002', name: '银行存款-美元', type: 'asset', direction: 'debit', level: 1, isLeaf: true, status: 'active', currency: 'USD' } as any)
    await db.exchangeRates.bulkAdd([
      { id: 'r1', currency: 'USD', date: '2026-01-15', rate: 7.0 },
      { id: 'r2', currency: 'USD', date: '2026-01-31', rate: 7.2 },
    ])
    // 期初汇率为 7.0：借美元户 700（100 USD），凭证已按 7.0 入账
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-01-10', period: '2026-01', status: 'audited', creator: 'u1', createdAt: 1,
      entries: [{ id: 'e1', summary: '收款', accountCode: '1002', accountName: '银行存款-美元', debit: 700, credit: 0, currency: 'USD', exchangeRate: 7.0, foreignAmount: 100 }],
    } as any)
  })

  it('按期末汇率重算产生折算差异', async () => {
    const lines = await getTranslationDifference('2026-01', '2026-01-31')
    expect(lines).toHaveLength(1)
    const l = lines[0]
    expect(l.currency).toBe('USD')
    expect(l.closingForeign).toBe(100)
    expect(l.oldBase).toBe(700) // 按 7.0 入账
    expect(l.newBase).toBe(720) // 100 * 7.2
    expect(l.adjustment).toBe(20)
  })
})
