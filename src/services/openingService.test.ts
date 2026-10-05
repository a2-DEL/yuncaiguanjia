import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { isOpeningBalanced, saveManualOpening, getOpeningBalance, deleteOpening } from '@/services/openingService'
import type { OpeningEntry } from '@/types/models'

describe('services/openingService 开账', () => {
  beforeEach(async () => { await db.openingBalances.clear() })

  it('isOpeningBalanced 借贷平衡判定', () => {
    expect(isOpeningBalanced([
      { accountCode: '1001', accountName: '', debit: 100, credit: 0 },
      { accountCode: '2001', accountName: '', debit: 0, credit: 100 },
    ])).toBe(true)
    expect(isOpeningBalanced([{ accountCode: '1001', accountName: '', debit: 100, credit: 0 }])).toBe(false)
  })

  it('saveManualOpening 不平衡则报错', async () => {
    await expect(saveManualOpening(2026, [{ accountCode: '1001', accountName: '', debit: 100, credit: 0 }])).rejects.toThrow()
  })

  it('saveManualOpening 写入并可读取', async () => {
    const entries: OpeningEntry[] = [
      { accountCode: '1001', accountName: '库存现金', debit: 1000, credit: 0 },
      { accountCode: '3001', accountName: '实收资本', debit: 0, credit: 1000 },
    ]
    await saveManualOpening(2026, entries)
    const r = await getOpeningBalance(2026)
    expect(r.source).toBe('manual')
    expect(r.entries.length).toBe(2)
    await deleteOpening(2026)
    const after = await getOpeningBalance(2026)
    expect(after.source).toBe('derived')
  })
})
