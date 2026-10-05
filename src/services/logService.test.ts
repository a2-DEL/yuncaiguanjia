import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { addLog, queryLogs, listLogModules, verifyLogChain, computeLogHash } from '@/services/logService'

describe('services/logService 操作日志', () => {
  beforeEach(async () => { await db.logs.clear() })

  it('addLog 写入并带操作人', async () => {
    await addLog('测试', '系统设置', 'detail')
    const { rows } = await queryLogs({ module: '系统设置' })
    expect(rows.length).toBe(1)
    expect(rows[0].detail).toBe('detail')
  })

  it('queryLogs 支持关键字与分页', async () => {
    await addLog('登录', '系统设置', '用户登录成功')
    await addLog('导出', '税务管理', '导出申报表')
    const r1 = await queryLogs({ keyword: '导出' })
    expect(r1.total).toBe(1)
    const r2 = await queryLogs({ page: 1, pageSize: 1 })
    expect(r2.rows.length).toBe(1)
    expect(r2.total).toBe(2)
  })

  it('listLogModules 返回去重模块', async () => {
    await addLog('a', '模块A', 'x')
    await addLog('b', '模块A', 'y')
    const m = await listLogModules()
    expect(m).toContain('模块A')
    expect(m.filter((x) => x === '模块A').length).toBe(1)
  })

  it('addLog 写入链式哈希（hash + prevHash）', async () => {
    await addLog('a', '模块A', 'x')
    await addLog('b', '模块A', 'y')
    const logs = await db.logs.orderBy('time').toArray()
    expect(logs[0].prevHash).toBe('')
    expect(logs[0].hash).toBeTruthy()
    expect(logs[1].prevHash).toBe(logs[0].hash)
    expect(logs[1].hash).not.toBe(logs[0].hash)
  })

  it('verifyLogChain 对完整链返回 ok', async () => {
    await addLog('a', '模块A', 'x')
    await addLog('b', '模块B', 'y')
    await addLog('c', '模块C', 'z')
    const result = await verifyLogChain()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(3)
    expect(result.tampered.length).toBe(0)
  })

  it('verifyLogChain 可检测篡改', async () => {
    await addLog('a', '模块A', 'x')
    await addLog('b', '模块B', 'y')
    // 篡改中间记录（修改 detail，使其存储 hash 不再匹配）
    const mid = (await db.logs.orderBy('time').toArray())[1]
    await db.logs.update(mid.id, { detail: '被篡改' })
    const result = await verifyLogChain()
    expect(result.ok).toBe(false)
    expect(result.tampered.some((t) => t.id === mid.id)).toBe(true)
  })

  it('computeLogHash 相同输入稳定、不同输入不同', async () => {
    const a = await computeLogHash('', { action: 'x', module: 'm', detail: 'd', userId: 'u', userName: 'n', time: 1 })
    const b = await computeLogHash('', { action: 'x', module: 'm', detail: 'd', userId: 'u', userName: 'n', time: 1 })
    const c = await computeLogHash('h', { action: 'x', module: 'm', detail: 'd', userId: 'u', userName: 'n', time: 1 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
