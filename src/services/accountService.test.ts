import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { buildAccountTree, matchAccounts, createAccount } from '@/services/accountService'
import type { Account } from '@/types/models'

const mk = (a: Partial<Account> & { code: string; name: string; type: Account['type']; direction: 'debit' | 'credit' }): Account => ({
  id: a.code, parentCode: null, level: 1, isLeaf: true, status: 'active', ...a,
})

describe('services/accountService 科目', () => {
  beforeEach(async () => { await db.accounts.clear() })

  it('buildAccountTree 构建层级（父级不再为末级）', async () => {
    await db.accounts.bulkAdd([
      mk({ code: '1001', name: '库存现金', type: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: false }),
      mk({ code: '100101', name: '人民币', type: 'asset', direction: 'debit', parentCode: '1001', level: 2, isLeaf: true }),
    ])
    const tree = await buildAccountTree()
    const root = tree.find((t) => t.code === '1001')!
    expect(root.isLeaf).toBe(false)
    expect(root.children?.length).toBe(1)
  })

  it('matchAccounts 仅匹配末级且按关键字', async () => {
    await db.accounts.bulkAdd([
      mk({ code: '1001', name: '库存现金', type: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: false }),
      mk({ code: '100101', name: '人民币', type: 'asset', direction: 'debit', parentCode: '1001', level: 2, isLeaf: true }),
    ])
    const r = await matchAccounts('人民币')
    expect(r.length).toBe(1)
    expect(r[0].code).toBe('100101')
  })

  it('createAccount 设置层级并取消父级末级', async () => {
    await db.accounts.add(mk({ code: '1001', name: '库存现金', type: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: true }))
    await createAccount({ code: '100101', name: '人民币', type: 'asset', direction: 'debit', parentCode: '1001' })
    const parent = await db.accounts.get('1001')
    expect(parent?.isLeaf).toBe(false)
    const child = await db.accounts.get('100101')
    expect(child?.level).toBe(2)
  })
})
