import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { createContact, createArApBill, settleBill, getOverdueBills } from '@/services/contactService'
import { createBankAccount } from '@/services/bankService'

describe('services/contactService 往来', () => {
  beforeEach(async () => {
    await db.contacts.clear(); await db.arApBills.clear(); await db.bankAccounts.clear()
    await db.cashFlows.clear(); await db.vouchers.clear(); await db.accounts.clear()
  })

  it('createContact 与 createArApBill', async () => {
    const c = await createContact({ code: 'C1', name: '客户A', type: 'customer' } as any)
    const b = await createArApBill({ direction: 'receivable', contactId: c.id, date: '2026-03-01', amount: 1000, subject: '货款' })
    expect(b.status).toBe('open')
    expect(b.amount).toBe(1000)
  })

  it('settleBill 减少余额并结清', async () => {
    await db.accounts.add({ id: '1001', code: '1001', name: '库存现金', parentCode: null, level: 1, type: 'asset', direction: 'debit', isLeaf: true, status: 'active' })
    await db.accounts.add({ id: '1122', code: '1122', name: '应收账款', parentCode: null, level: 1, type: 'asset', direction: 'debit', isLeaf: true, status: 'active' })
    await createBankAccount({ name: '现金', type: 'cash', currency: 'CNY', initialBalance: 0 })
    const acc = (await db.bankAccounts.toArray())[0]
    const c = await createContact({ code: 'C1', name: '客户A', type: 'customer' } as any)
    const b = await createArApBill({ direction: 'receivable', contactId: c.id, date: '2026-03-01', amount: 1000, subject: '货款' })
    const after = await settleBill(b.id, { amount: 1000, date: '2026-03-05', accountId: acc.id })
    expect(after.settled).toBe(1000)
    expect(after.status).toBe('closed')
  })

  it('getOverdueBills 识别逾期', async () => {
    const c = await createContact({ code: 'C1', name: '客户A', type: 'customer' } as any)
    await createArApBill({ direction: 'receivable', contactId: c.id, date: '2026-01-01', dueDate: '2026-01-15', amount: 1000, subject: '货款' })
    const overdue = await getOverdueBills()
    expect(overdue.length).toBe(1)
  })
})
