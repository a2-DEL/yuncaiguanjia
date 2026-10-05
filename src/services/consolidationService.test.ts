import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import {
  ensureDefaultEntity, listEntities, addEntity, getConsolidatedTrialBalance, getConsolidatedEliminations,
  getVouchersByAccount, DEFAULT_ENTITY_ID,
} from '@/services/consolidationService'

describe('services/consolidationService 集团合并报表', () => {
  beforeEach(async () => {
    await db.entities.clear()
    await db.vouchers.clear()
    await db.exchangeRates.clear()
  })

  it('默认主体在首次使用时被创建', async () => {
    await ensureDefaultEntity()
    const entities = await listEntities()
    expect(entities.some((e) => e.id === DEFAULT_ENTITY_ID)).toBe(true)
  })

  it('按汇率折算合并多账套试算平衡', async () => {
    await ensureDefaultEntity()
    const usd = await addEntity({ name: '美国子公司', currency: 'USD' })
    await db.exchangeRates.add({ id: 'er1', currency: 'USD', date: '2026-03-01', rate: 7, remark: '' })

    // 总部（CNY）凭证
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '1002', accountName: '银行存款', debit: 1000, credit: 0 }],
      creator: 'u1', createdAt: Date.now(), attachments: [], entityId: DEFAULT_ENTITY_ID,
    })
    // 美国子公司（USD）凭证：金额以 USD 计
    await db.vouchers.add({
      id: 'v2', voucherNo: '记-2', date: '2026-03-10', period: '2026-03', status: 'audited',
      entries: [{ id: 'e2', summary: 's', accountCode: '1002', accountName: '银行存款', debit: 200, credit: 0 }],
      creator: 'u1', createdAt: Date.now(), attachments: [], entityId: usd.id,
    })

    const rows = await getConsolidatedTrialBalance('2026-03', '2026-03-31')
    const bank = rows.find((r) => r.accountCode === '1002')
    expect(bank).toBeDefined()
    // 总部 1000 CNY + 美国 200 USD × 7 = 1400 CNY => 合计借方 2400
    expect(bank!.debit).toBeCloseTo(2400, 2)
    expect(bank!.byEntity[DEFAULT_ENTITY_ID].debit).toBeCloseTo(1000, 2)
    expect(bank!.byEntity[usd.id].debit).toBeCloseTo(1400, 2)
  })

  it('内部抵销分录被排除出合并试算，并单独汇总', async () => {
    await ensureDefaultEntity()
    await db.exchangeRates.add({ id: 'er1', currency: 'CNY', date: '2026-03-01', rate: 1, remark: '' })

    // 普通凭证
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '1122', accountName: '应收账款', debit: 500, credit: 0 }],
      creator: 'u1', createdAt: Date.now(), attachments: [],
    })
    // 内部抵销凭证（应收/应付对冲）
    await db.vouchers.add({
      id: 'v2', voucherNo: '记-2', date: '2026-03-20', period: '2026-03', status: 'audited', isElimination: true,
      entries: [
        { id: 'e2', summary: '抵销', accountCode: '1122', accountName: '应收账款', debit: 0, credit: 500 },
        { id: 'e3', summary: '抵销', accountCode: '2202', accountName: '应付账款', debit: 500, credit: 0 },
      ],
      creator: 'u1', createdAt: Date.now(), attachments: [],
    })

    const rows = await getConsolidatedTrialBalance('2026-03', '2026-03-31')
    const ar = rows.find((r) => r.accountCode === '1122')
    // 合并试算中应收账款应只剩 500（抵销分录不计入）
    expect(ar!.debit).toBeCloseTo(500, 2)

    const elim = await getConsolidatedEliminations('2026-03', '2026-03-31')
    const elimAr = elim.find((r) => r.accountCode === '1122')
    expect(elimAr).toBeDefined()
    expect(elimAr!.credit).toBeCloseTo(500, 2)
  })

  it('下钻可穿透到某科目涉及的明细凭证', async () => {
    await ensureDefaultEntity()
    await db.vouchers.add({
      id: 'v1', voucherNo: '记-1', date: '2026-03-05', period: '2026-03', status: 'audited',
      entries: [{ id: 'e1', summary: 's', accountCode: '1002', accountName: '银行存款', debit: 1000, credit: 0 }],
      creator: 'u1', createdAt: Date.now(), attachments: [],
    })
    await db.vouchers.add({
      id: 'v2', voucherNo: '记-2', date: '2026-03-06', period: '2026-03', status: 'audited',
      entries: [
        { id: 'e2', summary: 's', accountCode: '1002', accountName: '银行存款', debit: 0, credit: 300 },
        { id: 'e3', summary: 's', accountCode: '1001', accountName: '库存现金', debit: 300, credit: 0 },
      ],
      creator: 'u1', createdAt: Date.now(), attachments: [],
    })
    const vs = await getVouchersByAccount('1002', '2026-03')
    expect(vs.length).toBe(2)
    expect(vs.map((v) => v.id).sort()).toEqual(['v1', 'v2'])
  })
})
