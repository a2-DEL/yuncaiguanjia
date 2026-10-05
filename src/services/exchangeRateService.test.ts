import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { getRate } from '@/services/exchangeRateService'

describe('services/exchangeRateService 汇率', () => {
  beforeEach(async () => { await db.exchangeRates.clear() })

  it('CNY 恒为 1', async () => {
    expect(await getRate('CNY', '2026-03-01')).toBe(1)
  })

  it('取不晚于日期的最新汇率', async () => {
    await db.exchangeRates.bulkAdd([
      { id: 'r1', currency: 'USD', date: '2026-01-01', rate: 7, remark: '' },
      { id: 'r2', currency: 'USD', date: '2026-03-01', rate: 7.2, remark: '' },
    ])
    expect(await getRate('USD', '2026-02-01')).toBe(7)
    expect(await getRate('USD', '2026-03-15')).toBe(7.2)
  })

  it('无记录返回 null', async () => {
    expect(await getRate('USD', '2026-03-01')).toBeNull()
  })
})
