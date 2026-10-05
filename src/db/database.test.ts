import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/db/database'

describe('database 基建', () => {
  beforeAll(async () => {
    await db.open()
  })

  it('在 fake-indexeddb 环境下可打开并暴露核心表', () => {
    expect(db.accounts).toBeDefined()
    expect(db.vouchers).toBeDefined()
    expect(db.exchangeRates).toBeDefined()
    expect(db.budgets).toBeDefined()
  })

  it('可读写 exchangeRates 表（验证 Dexie 在测试环境可用）', async () => {
    await db.exchangeRates.add({ id: 'er_test', currency: 'USD', date: '2026-01-15', rate: 7.2 })
    const rows = await db.exchangeRates.where('currency').equals('USD').toArray()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    await db.exchangeRates.delete('er_test')
  })
})
