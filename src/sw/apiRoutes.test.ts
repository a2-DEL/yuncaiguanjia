import { describe, it, expect, beforeEach } from 'vitest'
import { matchEntity, resolveReadonly } from '@/sw/apiRoutes'
import { db } from '@/db/database'

beforeEach(async () => {
  await db.accounts.clear()
  await db.accounts.add({ id: 'a1', code: '1001', name: '库存现金', type: 'asset', direction: 'debit', status: 'active', isLeaf: true, parentCode: '', level: 1 })
  await db.accounts.add({ id: 'a2', code: '1002', name: '银行存款', type: 'asset', direction: 'debit', status: 'active', isLeaf: true, parentCode: '', level: 1 })
})

describe('apiRoutes', () => {
  it('matchEntity 解析表名与 id', () => {
    expect(matchEntity('/api/v1/vouchers')).toEqual({ table: 'vouchers' })
    expect(matchEntity('/api/v1/vouchers/abc')).toEqual({ table: 'vouchers', id: 'abc' })
    expect(matchEntity('/api/v1/bank-accounts')).toEqual({ table: 'bankAccounts' })
    expect(matchEntity('/api/v1/unknown')).toBeNull()
  })

  it('非 GET 返回 405', async () => {
    const r = await resolveReadonly({ method: 'POST', path: '/api/v1/vouchers', query: {} })
    expect(r.status).toBe(405)
  })

  it('未知端点返回 404', async () => {
    const r = await resolveReadonly({ method: 'GET', path: '/api/v1/nope', query: {} })
    expect(r.status).toBe(404)
  })

  it('health 与根路径返回 200', async () => {
    expect((await resolveReadonly({ method: 'GET', path: '/api/v1/health', query: {} })).status).toBe(200)
    expect((await resolveReadonly({ method: 'GET', path: '/api/v1', query: {} })).status).toBe(200)
  })

  it('实体集合支持分页', async () => {
    const r = await resolveReadonly({ method: 'GET', path: '/api/v1/accounts', query: { limit: '1', offset: '0' } })
    expect(r.status).toBe(200)
    const body = r.body as { total: number; count: number; rows: unknown[] }
    expect(body.total).toBe(2)
    expect(body.count).toBe(1)
    expect(body.rows.length).toBe(1)
  })
})
