import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { createBankAccount, recordCashFlow, getAccountBalance } from '@/services/bankService'

describe('services/bankService 出纳', () => {
  beforeEach(async () => {
    await db.bankAccounts.clear(); await db.cashFlows.clear(); await db.vouchers.clear(); await db.accounts.clear()
  })

  it('recordCashFlow 收款生成凭证并更新余额', async () => {
    await db.accounts.add({ id: '1001', code: '1001', name: '库存现金', parentCode: null, level: 1, type: 'asset', direction: 'debit', isLeaf: true, status: 'active' })
    await db.accounts.add({ id: '6001', code: '6001', name: '主营业务收入', parentCode: null, level: 1, type: 'profit', direction: 'credit', isLeaf: true, status: 'active' })
    await createBankAccount({ name: '现金户', type: 'cash', currency: 'CNY', initialBalance: 1000 })
    const acc = (await db.bankAccounts.toArray())[0]
    const flow = await recordCashFlow({ date: '2026-03-01', accountId: acc.id, type: 'income', category: '销售收款', amount: 500, summary: '收款', offsetAccountCode: '6001' })
    expect(flow.voucherNo).toBeTruthy()
    expect(await getAccountBalance(acc.id)).toBe(1500)
  })

  it('recordCashFlow 金额必须为正', async () => {
    await createBankAccount({ name: '现金户', type: 'cash', currency: 'CNY', initialBalance: 0 })
    const acc = (await db.bankAccounts.toArray())[0]
    await expect(recordCashFlow({ date: '2026-03-01', accountId: acc.id, type: 'income', category: 'x', amount: 0, summary: 'x', offsetAccountCode: '6001' })).rejects.toThrow()
  })
})
