import { describe, it, expect, beforeEach } from 'vitest'
import { createGood, createStockMove, listStockMoves, getInventorySummary } from '@/services/inventoryService'
import { db } from '@/db/database'
import { isBalanced } from '@/services/voucherService'

describe('services/inventoryService 进销存业财一体', () => {
  beforeEach(async () => {
    await db.goods.clear()
    await db.stockMoves.clear()
    await db.vouchers.clear()
  })

  it('采购入库自动生成平衡的借库存商品/贷银行存款凭证', async () => {
    const g = await createGood({ code: 'P001', name: '测试商品' })
    const { move, voucherNo } = await createStockMove({ goodsId: g.id, type: 'in', qty: 10, price: 100 })
    expect(move.amount).toBe(1000)
    expect(move.voucherNo).toBeTruthy()
    const v = await db.vouchers.where('voucherNo').equals(voucherNo).first()
    expect(v).toBeTruthy()
    expect(isBalanced(v!.entries)).toBe(true)
    const debit = v!.entries.find(e => e.debit > 0)!
    const credit = v!.entries.find(e => e.credit > 0)!
    expect(debit.accountCode).toBe('1405')
    expect(credit.accountCode).toBe('1002')
  })

  it('销售出库生成四行分录（收入 + 结转成本）且平衡', async () => {
    const g = await createGood({ code: 'P002', name: '商品B' })
    const { voucherNo } = await createStockMove({ goodsId: g.id, type: 'out', qty: 5, price: 200 })
    const v = await db.vouchers.where('voucherNo').equals(voucherNo).first()
    expect(v!.entries.length).toBe(4)
    expect(isBalanced(v!.entries)).toBe(true)
    // 借方合计 = 收入(1000) + 成本(1000) = 2000；贷方 = 主营业务收入(1000)+库存商品(1000)=2000
    const totalDebit = v!.entries.reduce((s, e) => s + e.debit, 0)
    expect(totalDebit).toBe(2000)
  })

  it('汇总统计正确', async () => {
    const g = await createGood({ code: 'P003', name: '商品C' })
    await createStockMove({ goodsId: g.id, type: 'in', qty: 10, price: 50 })
    await createStockMove({ goodsId: g.id, type: 'out', qty: 2, price: 80 })
    const s = await getInventorySummary()
    expect(s.goodsCount).toBe(1)
    expect(s.inAmount).toBe(500)
    expect(s.outAmount).toBe(160)
    expect((await listStockMoves()).length).toBe(2)
  })

  it('数量为 0 或商品不存在时抛异常', async () => {
    const g = await createGood({ code: 'P004', name: '商品D' })
    await expect(createStockMove({ goodsId: g.id, type: 'in', qty: 0, price: 10 })).rejects.toThrow()
    await expect(createStockMove({ goodsId: 'nope', type: 'in', qty: 1, price: 10 })).rejects.toThrow()
  })
})
