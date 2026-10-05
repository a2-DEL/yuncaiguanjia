/**
 * 轻量业财一体 · 应收/应付往来单：业务单据登记、结算，并一键生成收/付款凭证（闭环同步账务）。
 * 与费用报销（expenseService.generateVoucherForClaim）、发票（taxService.createInvoice）共同构成业务→凭证联动。
 */
import { db } from '@/db/database'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { emit } from './webhookService'
import { saveVoucher } from './voucherService'
import { getAccount } from './accountService'
import { useUserStore } from '@/store/userStore'
import type { ArApBill, ArApDirection, ArApStatus } from '@/types/models'

export interface ArApFilter {
  direction?: ArApDirection
  status?: ArApStatus
  keyword?: string
}

export async function listArApBills(filter: ArApFilter = {}): Promise<ArApBill[]> {
  let list = await db.arApBills.toArray()
  if (filter.direction) list = list.filter((b) => b.direction === filter.direction)
  if (filter.status) list = list.filter((b) => b.status === filter.status)
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
  billNo: string
  date: string
  dueDate?: string
  amount: number
  subject: string
}): Promise<ArApBill> {
  const bill: ArApBill = {
    id: uid('ap_'),
    direction: input.direction,
    contactId: input.contactId,
    billNo: input.billNo,
    date: input.date,
    dueDate: input.dueDate,
    amount: input.amount,
    settled: 0,
    status: 'open',
    subject: input.subject,
    createdAt: Date.now(),
  }
  await db.arApBills.add(bill)
  await addLog('新增往来单', '往来账款', `${input.direction === 'receivable' ? '应收' : '应付'}单 ${input.billNo}`)
  return bill
}

/** 部分/全额结算：累计已收（付）金额并刷新状态 */
export async function settleBill(id: string, amount: number): Promise<void> {
  const bill = await db.arApBills.get(id)
  if (!bill) throw new Error('往来单不存在')
  const settled = Math.round((bill.settled + amount) * 100) / 100
  const status: ArApStatus = settled >= bill.amount - 0.005 ? 'closed' : settled > 0 ? 'partial' : 'open'
  await db.arApBills.update(id, { settled, status })
  await addLog('结算往来', '往来账款', `往来单 ${bill.billNo} 结算 ${amount}`)
}

/**
 * 一键生成凭证（业财一体闭环）：
 * 应收 → 借 银行存款1002 / 贷 应收账款1122；应付 → 借 应付账款2202 / 贷 银行存款1002。
 * 幂等：已生成则直接返回原凭证号。
 */
export async function generateVoucherForBill(id: string): Promise<string> {
  const bill = await db.arApBills.get(id)
  if (!bill) throw new Error('往来单不存在')
  if (bill.voucherNo) return bill.voucherNo
  const user = useUserStore.getState().currentUser
  const contact = await db.contacts.get(bill.contactId)
  const summary = `${bill.direction === 'receivable' ? '收回' : '支付'}往来 ${contact?.name ?? ''} ${bill.subject}`.trim()
  const bankName = (await getAccount('1002'))?.name ?? '银行存款'
  const arName = (await getAccount('1122'))?.name ?? '应收账款'
  const apName = (await getAccount('2202'))?.name ?? '应付账款'
  const entries = bill.direction === 'receivable'
    ? [
        { id: uid('e_'), summary, accountCode: '1002', accountName: bankName, debit: bill.amount, credit: 0 },
        { id: uid('e_'), summary, accountCode: '1122', accountName: arName, debit: 0, credit: bill.amount },
      ]
    : [
        { id: uid('e_'), summary, accountCode: '2202', accountName: apName, debit: bill.amount, credit: 0 },
        { id: uid('e_'), summary, accountCode: '1002', accountName: bankName, debit: 0, credit: bill.amount },
      ]
  const voucher = await saveVoucher({
    date: bill.date,
    entries,
    remark: `往来单 ${bill.billNo}`,
    creator: user?.name ?? '系统',
  })
  await db.arApBills.update(id, { voucherNo: voucher.voucherNo })
  await addLog('生成凭证', '往来账款', `往来单 ${bill.billNo} 生成凭证 ${voucher.voucherNo}`)
  void emit('arap.voucher', { id, direction: bill.direction, voucherNo: voucher.voucherNo })
  return voucher.voucherNo
}
