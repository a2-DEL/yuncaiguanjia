import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { calcMonthlyDepreciation, createAsset, runDepreciation } from '@/services/assetService'
import type { Asset } from '@/types/models'

const baseAsset = (over: Partial<Asset>): Asset => ({
  id: 'as1', code: 'A1', name: '设备', category: 'office', originalValue: 12000, salvageRate: 0.1,
  usefulLife: 12, depreciationMethod: 'straight', startDate: '2026-01-01', accumulatedDepreciation: 0, status: 'in_use', ...over,
})

describe('services/assetService 固定资产', () => {
  beforeEach(async () => {
    await db.assets.clear(); await db.depreciations.clear(); await db.accounts.clear(); await db.vouchers.clear()
  })

  it('calcMonthlyDepreciation 直线法', () => {
    const a = baseAsset({ originalValue: 12000, salvageRate: 0.1, usefulLife: 12, depreciationMethod: 'straight' })
    // (12000 - 1200) / 12 = 900
    expect(calcMonthlyDepreciation(a)).toBe(900)
  })

  it('calcMonthlyDepreciation 双倍余额递减', () => {
    const a = baseAsset({ originalValue: 12000, salvageRate: 0, usefulLife: 12, depreciationMethod: 'double' })
    // 12000 * 2 / 12 = 2000
    expect(calcMonthlyDepreciation(a)).toBe(2000)
  })

  it('runDepreciation 生成折旧记录与凭证（幂等）', async () => {
    await db.accounts.bulkAdd([
      { id: '6602', code: '6602', name: '管理费用', parentCode: null, level: 1, type: 'cost', direction: 'debit', isLeaf: true, status: 'active' },
      { id: '1602', code: '1602', name: '累计折旧', parentCode: null, level: 1, type: 'asset', direction: 'credit', isLeaf: true, status: 'active' },
    ])
    await createAsset({ code: 'A1', name: '设备', category: 'office', originalValue: 12000, salvageRate: 0.1, usefulLife: 12, depreciationMethod: 'straight', startDate: '2026-01-01' })
    const res = await runDepreciation('2026-03')
    expect(res.count).toBe(1)
    expect(res.total).toBe(900)
    const res2 = await runDepreciation('2026-03')
    expect(res2.count).toBe(0)
  })
})
