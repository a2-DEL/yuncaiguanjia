import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { isPeriodClosed, getClosingInfo, closePeriod } from '@/services/closingService'
import type { Account } from '@/types/models'

const acc = (code: string, type: Account['type'], dir: 'debit' | 'credit'): Account => ({
  id: code, code, name: code, parentCode: null, level: 1, type, direction: dir, isLeaf: true, status: 'active',
})

describe('services/closingService 结账', () => {
  beforeEach(async () => { await db.accounts.clear(); await db.vouchers.clear(); await db.closings.clear() })

  it('isPeriodClosed 默认未结账', async () => {
    expect(await isPeriodClosed('2026-03')).toBe(false)
  })

  it('getClosingInfo 反映未审核与未结账', async () => {
    await db.accounts.bulkAdd([acc('6001', 'profit', 'credit'), acc('1001', 'asset', 'debit')])
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'draft',
      entries: [{ id: 'e1', summary: 's', accountCode: '1001', accountName: '库存现金', debit: 100, credit: 0 }],
      creator: 'u', createdAt: Date.now(), attachments: [],
    })
    const info = await getClosingInfo('2026-03')
    expect(info.hasUnaudited).toBe(1)
    expect(info.isClosed).toBe(false)
  })

  it('closePeriod 校验未审核凭证并结账', async () => {
    await db.accounts.bulkAdd([acc('6001', 'profit', 'credit'), acc('1001', 'asset', 'debit'), acc('3103', 'equity', 'credit')])
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '1001', accountName: '库存现金', debit: 100, credit: 0 }],
      creator: 'u', createdAt: Date.now(), attachments: [],
    })
    await closePeriod('2026-03')
    expect(await isPeriodClosed('2026-03')).toBe(true)
  })
})
