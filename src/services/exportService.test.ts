import { describe, it, expect, beforeEach, vi } from 'vitest'
import { exportAllJson, exportEntityCsv, exportEntityJson, EXPORTABLE_ENTITIES } from '@/services/exportService'
import { db } from '@/db/database'

beforeEach(async () => {
  await db.accounts.clear()
  await db.vouchers.clear()
  await db.accounts.add({ id: 'a1', code: '1001', name: '库存现金', type: 'asset', direction: 'debit', status: 'active', isLeaf: true, parentCode: '', level: 1 })
  await db.vouchers.add({ id: 'v1', voucherNo: '记-2026-01-0001', date: '2026-01-01', period: '2026-01', entries: [], status: 'draft', attachments: [], creator: 'u', createdAt: 1 })
})

describe('exportService', () => {
  it('全量导出返回总记录数且触发下载（不抛错）', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    const total = await exportAllJson('t.json')
    expect(total).toBe(2) // 已播种 accounts(1) + vouchers(1)，其余表为空
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('单实体 CSV 导出不抛错', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    await expect(exportEntityCsv('accounts', 'a.csv')).resolves.toBeUndefined()
  })

  it('单实体 JSON 导出不抛错', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    await expect(exportEntityJson('vouchers', 'v.json')).resolves.toBeUndefined()
  })
})
