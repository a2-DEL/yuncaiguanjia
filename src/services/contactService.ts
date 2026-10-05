import { db } from '@/db/database'
import type { Contact, ContactType, ArApBill, ArApDirection, ArApStatus } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { recordCashFlow } from './bankService'

export async function listContacts(type?: ContactType): Promise<Contact[]> {
  let list = await db.contacts.toArray()
  if (type) list = list.filter((c) => c.type === type)
  return list.sort((a, b) => a.code.localeCompare(b.code))
}

export async function createContact(
  data: Omit<Contact, 'id'>,
): Promise<Contact> {
  const contact: Contact = { id: uid('ct_'), ...data }
  await db.contacts.add(contact)
  await addLog('新增往来单位', '往来管理', `新增${data.type === 'customer' ? '客户' : '供应商'} ${data.name}`)
  return contact
}

export async function updateContact(id: string, patch: Partial<Contact>) {
  await db.contacts.update(id, patch)
  await addLog('编辑往来单位', '往来管理', `编辑往来单位 ${patch.name ?? id}`)
}

export async function deleteContact(id: string) {
  await db.contacts.delete(id)
  await addLog('删除往来单位', '往来管理', `删除往来单位 ${id}`)
}

export interface ArApFilter {
  direction?: ArApDirection
  status?: ArApStatus
  contactId?: string
  keyword?: string
}

export async function listArApBills(filter: ArApFilter = {}): Promise<ArApBill[]> {
  let list = await db.arApBills.toArray()
  if (filter.direction) list = list.filter((b) => b.direction === filter.direction)
  if (filter.status) list = list.filter((b) => b.status === filter.status)
  if (filter.contactId) list = list.filter((b) => b.contactId === filter.contactId)
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    list = list.filter((b) => b.billNo.toLowerCase().includes(kw) || b.subject.toLowerCase().includes(kw))
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}

export async function createArApBill(input: {
  direction: ArApDirection
  contactId: string
  date: string
  dueDate?: string
  amount: number
  subject: string
  billNo?: string
}): Promise<ArApBill> {
  const billNo = input.billNo || `ARAP${Date.now().toString().slice(-8)}`
  const bill: ArApBill = {
    id: uid('bl_'),
    direction: input.direction,
    contactId: input.contactId,
    billNo,
    date: input.date,
    dueDate: input.dueDate,
    amount: input.amount,
    settled: 0,
    status: 'open',
    subject: input.subject,
    createdAt: Date.now(),
  }
  await db.arApBills.add(bill)
  await addLog('新增往来单据', '往来管理', `新增${input.direction === 'receivable' ? '应收' : '应付'}单据 ${billNo}`)
  return bill
}

export async function deleteArApBill(id: string) {
  await db.arApBills.delete(id)
  await addLog('删除往来单据', '往来管理', `删除单据 ${id}`)
}

/** 核销/结算：登记收付款并减少单据余额，可选同步生成资金流水 */
export async function settleBill(
  id: string,
  input: { amount: number; date: string; accountId?: string },
): Promise<ArApBill> {
  const bill = await db.arApBills.get(id)
  if (!bill) throw new Error('单据不存在')
  const newSettled = Math.min(bill.amount, bill.settled + input.amount)
  const status: ArApStatus = newSettled >= bill.amount - 0.005 ? 'closed' : 'partial'
  await db.arApBills.update(id, {
    settled: newSettled,
    status,
    closedAt: status === 'closed' ? Date.now() : undefined,
  })
  if (input.accountId) {
    const contact = await db.contacts.get(bill.contactId)
    const isReceivable = bill.direction === 'receivable'
    // 统一走出纳 recordCashFlow：生成资金流水 + 收付款凭证，保证与总账一致
    const flow = await recordCashFlow({
      date: input.date,
      accountId: input.accountId,
      type: isReceivable ? 'income' : 'expense',
      category: isReceivable ? '收回账款' : '支付账款',
      counterparty: contact?.name,
      amount: input.amount,
      summary: `结算 ${bill.billNo}`,
      offsetAccountCode: isReceivable ? '1122' : '2202',
    })
    await db.arApBills.update(id, { voucherNo: flow.voucherNo })
  }
  await addLog('核销单据', '往来管理', `核销 ${bill.billNo} 金额 ${input.amount}`)
  return (await db.arApBills.get(id))!
}

/** 逾期预警：到期日早于今天且未结清 */
export async function getOverdueBills(): Promise<ArApBill[]> {
  const today = new Date().toISOString().slice(0, 10)
  const bills = await db.arApBills.filter((b) => b.status !== 'closed' && !!b.dueDate && b.dueDate < today).toArray()
  return bills
}
