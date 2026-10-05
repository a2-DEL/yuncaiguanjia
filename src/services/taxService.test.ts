import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { getTaxSummary, getTaxReturnRows } from '@/services/taxService'

describe('services/taxService 税负统计与申报表', () => {
  beforeEach(async () => {
    await db.invoices.clear()
  })

  it('getTaxSummary 正确计算销项/进项与应交增值税', async () => {
    await db.invoices.bulkAdd([
      { id: 'iv1', type: 'sales', invoiceNo: 's1', date: '2026-03-05', period: '2026-03', counterparty: 'A', amount: 1000, taxRate: 0.13, taxAmount: 130, totalAmount: 1130, status: 'normal' },
      { id: 'iv2', type: 'purchase', invoiceNo: 'p1', date: '2026-03-10', period: '2026-03', counterparty: 'B', amount: 500, taxRate: 0.13, taxAmount: 65, totalAmount: 565, status: 'normal' },
      { id: 'iv3', type: 'sales', invoiceNo: 's2', date: '2026-03-20', period: '2026-03', counterparty: 'C', amount: 200, taxRate: 0.13, taxAmount: 26, totalAmount: 226, status: 'cancelled' },
    ])
    const s = await getTaxSummary('2026-03')
    expect(s.salesAmount).toBe(1000)
    expect(s.salesTax).toBe(130)
    expect(s.purchaseTax).toBe(65)
    expect(s.netTax).toBe(65)
  })

  it('getTaxReturnRows 含应纳税额行且等于销项减进项', async () => {
    await db.invoices.bulkAdd([
      { id: 'iv1', type: 'sales', invoiceNo: 's1', date: '2026-03-05', period: '2026-03', counterparty: 'A', amount: 1000, taxRate: 0.13, taxAmount: 130, totalAmount: 1130, status: 'normal' },
      { id: 'iv2', type: 'purchase', invoiceNo: 'p1', date: '2026-03-10', period: '2026-03', counterparty: 'B', amount: 500, taxRate: 0.13, taxAmount: 65, totalAmount: 565, status: 'normal' },
    ])
    const rows = await getTaxReturnRows('2026-03')
    const net = rows.find((r) => r.label.includes('应纳税额'))
    expect(net).toBeDefined()
    expect(net?.amount).toBe(65)
    // 按税率分列：13% 销售额行存在
    expect(rows.some((r) => r.label.includes('13% 销售额'))).toBe(true)
  })
})
