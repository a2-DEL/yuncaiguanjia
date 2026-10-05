import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import {
  listArApBills, createArApBill, settleBill, generateVoucherForBill,
} from '@/services/arApBillService'

describe('services/arApBillService 应收应付（业财一体）', () => {
  beforeEach(async () => {
    await db.arApBills.clear()
    await db.contacts.clear()
    await db.vouchers.clear()
    await db.contacts.add({ id: 'c1', name: '甲客户', type: 'customer', code: 'C01' } as any)
  })

  it('登记往来单默认未结算', async () => {
    const bill = await createArApBill({
      direction: 'receivable', contactId: 'c1', billNo: 'AP-1', date: '2026-04-01', amount: 1000, subject: '货款',
    })
    expect(bill.status).toBe('open')
    expect(bill.settled).toBe(0)
    const list = await listArApBills({ direction: 'receivable' })
    expect(list.length).toBe(1)
  })

  it('结算状态机：部分→全额结清', async () => {
    const bill = await createArApBill({
      direction: 'payable', contactId: 'c1', billNo: 'AP-2', date: '2026-04-01', amount: 1000, subject: '采购',
    })
    await settleBill(bill.id, 400)
    let b = await db.arApBills.get(bill.id)
    expect(b!.status).toBe('partial')
    expect(b!.settled).toBe(400)
    await settleBill(bill.id, 600)
    b = await db.arApBills.get(bill.id)
    expect(b!.status).toBe('closed')
    expect(b!.settled).toBe(1000)
  })

  it('应收一键生成凭证：借银行存款/贷应收账款，并幂等回写', async () => {
    const bill = await createArApBill({
      direction: 'receivable', contactId: 'c1', billNo: 'AP-3', date: '2026-04-02', amount: 1200, subject: '货款',
    })
    const no = await generateVoucherForBill(bill.id)
    expect(no).toBeTruthy()
    const b = await db.arApBills.get(bill.id)
    expect(b!.voucherNo).toBe(no)
    const v = (await db.vouchers.where('voucherNo').equals(no).toArray())[0]
    const debit = v.entries.find((e) => e.accountCode === '1002')
    const credit = v.entries.find((e) => e.accountCode === '1122')
    expect(debit?.debit).toBe(1200)
    expect(credit?.credit).toBe(1200)
    // 幂等：重复调用返回同一凭证号，不重复生成
    const no2 = await generateVoucherForBill(bill.id)
    expect(no2).toBe(no)
    expect(await db.vouchers.count()).toBe(1)
  })

  it('应付一键生成凭证：借应付账款/贷银行存款', async () => {
    const bill = await createArApBill({
      direction: 'payable', contactId: 'c1', billNo: 'AP-4', date: '2026-04-02', amount: 800, subject: '采购款',
    })
    const no = await generateVoucherForBill(bill.id)
    const v = (await db.vouchers.where('voucherNo').equals(no).toArray())[0]
    const debit = v.entries.find((e) => e.accountCode === '2202')
    const credit = v.entries.find((e) => e.accountCode === '1002')
    expect(debit?.debit).toBe(800)
    expect(credit?.credit).toBe(800)
  })
})
