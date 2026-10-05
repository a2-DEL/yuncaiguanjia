import { describe, it, expect, beforeEach } from 'vitest'
import { getDashboard, getRevenueExpenseTrend } from '@/services/reportService'
import { db } from '@/db/database'
import { currentPeriod } from '@/utils/format'

async function seed() {
  await db.accounts.clear()
  await db.vouchers.clear()
  const acc = (code: string, name: string, type: any, direction: any) =>
    ({ id: code, code, name, parentCode: null, level: 1, type, direction, isLeaf: true, status: 'active' } as any)
  await db.accounts.bulkAdd([
    acc('1002', '银行存款', 'asset', 'debit'),
    acc('6001', '主营业务收入', 'profit', 'credit'),
    acc('660202', '管理费用-差旅费', 'profit', 'debit'),
  ])
  const p = currentPeriod()
  const v = (id: string, entries: any[]) =>
    ({ id, voucherNo: id, date: `${p}-10`, period: p, entries, status: 'audited', creator: 'u1', createdAt: 1 } as any)
  await db.vouchers.bulkAdd([
    v('v1', [
      { id: 'e1', summary: '收入', accountCode: '1002', accountName: '银行存款', debit: 10000, credit: 0 },
      { id: 'e2', summary: '收入', accountCode: '6001', accountName: '主营业务收入', debit: 0, credit: 10000 },
    ]),
    v('v2', [
      { id: 'e3', summary: '费用', accountCode: '660202', accountName: '管理费用-差旅费', debit: 3000, credit: 0 },
      { id: 'e4', summary: '费用', accountCode: '1002', accountName: '银行存款', debit: 0, credit: 3000 },
    ]),
  ])
}

describe('reportService 驾驶舱数据层', () => {
  beforeEach(async () => {
    await seed()
  })

  it('getDashboard 聚合收入/支出/利润与资金余额', async () => {
    const d = await getDashboard(currentPeriod())
    expect(d.revenue).toBe(10000)
    expect(d.expense).toBe(3000)
    expect(d.profit).toBe(7000)
    expect(d.accountBalance).toBe(7000) // 银行存款 10000 - 3000
  })

  it('getRevenueExpenseTrend 返回近 6 月且末月正确', async () => {
    const t = await getRevenueExpenseTrend(6)
    expect(t.length).toBe(6)
    const last = t[t.length - 1]
    expect(last.revenue).toBe(10000)
    expect(last.expense).toBe(3000)
  })
})
