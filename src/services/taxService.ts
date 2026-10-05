import { db } from '@/db/database'
import type { Invoice, InvoiceType, InvoiceStatus, VoucherEntry } from '@/types/models'
import { uid, currentPeriod } from '@/utils/format'
import { addLog } from './logService'
import { emit } from './webhookService'
import { saveVoucher } from './voucherService'
import { getAccount } from './accountService'
import { useUserStore } from '@/store/userStore'

export async function listInvoices(filter: { type?: InvoiceType; status?: InvoiceStatus; keyword?: string } = {}): Promise<Invoice[]> {
  let list = await db.invoices.toArray()
  if (filter.type) list = list.filter((i) => i.type === filter.type)
  if (filter.status) list = list.filter((i) => i.status === filter.status)
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    list = list.filter((i) => i.invoiceNo.toLowerCase().includes(kw) || i.counterparty.toLowerCase().includes(kw))
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}

export async function createInvoice(input: {
  type: InvoiceType
  invoiceNo: string
  date: string
  counterparty: string
  taxNo?: string
  amount: number
  taxRate: number
  remark?: string
  offsetAccountCode?: string // 对方科目：销项默认 1122 应收账款，进项默认 2202 应付账款
}): Promise<Invoice> {
  const taxAmount = Math.round(input.amount * input.taxRate * 100) / 100
  const totalAmount = Math.round((input.amount + taxAmount) * 100) / 100
  const offsetAccountCode = input.offsetAccountCode ?? (input.type === 'sales' ? '1122' : '2202')
  const invoice: Invoice = {
    id: uid('iv_'),
    type: input.type,
    invoiceNo: input.invoiceNo,
    date: input.date,
    period: input.date.slice(0, 7),
    counterparty: input.counterparty,
    taxNo: input.taxNo,
    amount: input.amount,
    taxRate: input.taxRate,
    taxAmount,
    totalAmount,
    status: 'normal',
    remark: input.remark,
  }
  await db.invoices.add(invoice)

  let voucherNo: string | undefined
  const user = useUserStore.getState().currentUser?.name ?? '系统'
  const summary = `${input.type === 'sales' ? '销项' : '进项'}发票 ${input.invoiceNo}`
  const entries: VoucherEntry[] = []
  if (input.type === 'sales') {
    const off = await getAccount(offsetAccountCode)
    entries.push({ id: uid('e_'), summary, accountCode: offsetAccountCode, accountName: off?.name ?? '', debit: totalAmount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: '6001', accountName: (await getAccount('6001'))?.name ?? '主营业务收入', debit: 0, credit: input.amount })
    entries.push({ id: uid('e_'), summary, accountCode: '2221', accountName: (await getAccount('2221'))?.name ?? '应交税费', debit: 0, credit: taxAmount })
  } else {
    const off = await getAccount(offsetAccountCode)
    entries.push({ id: uid('e_'), summary, accountCode: '6401', accountName: (await getAccount('6401'))?.name ?? '主营业务成本', debit: input.amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: '2221', accountName: (await getAccount('2221'))?.name ?? '应交税费', debit: taxAmount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: offsetAccountCode, accountName: off?.name ?? '', debit: 0, credit: totalAmount })
  }
  const voucher = await saveVoucher({ date: input.date, entries, remark: `登记${summary}`, creator: user })
  voucherNo = voucher.voucherNo
  await db.invoices.update(invoice.id, { voucherNo })
  await addLog('登记发票', '税务管理', `登记${summary}${voucherNo ? `（凭证 ${voucherNo}）` : ''}`)
  void emit('invoice.created', { ...invoice, voucherNo })
  return { ...invoice, voucherNo }
}

export async function updateInvoice(id: string, patch: Partial<Invoice>) {
  await db.invoices.update(id, patch)
  await addLog('编辑发票', '税务管理', `编辑发票 ${id}`)
}

export async function cancelInvoice(id: string) {
  await db.invoices.update(id, { status: 'cancelled' })
  await addLog('作废发票', '税务管理', `作废发票 ${id}`)
}

export async function deleteInvoice(id: string) {
  await db.invoices.delete(id)
  await addLog('删除发票', '税务管理', `删除发票 ${id}`)
}

export interface TaxSummary {
  period: string
  salesAmount: number
  salesTax: number
  purchaseAmount: number
  purchaseTax: number
  netTax: number // 应交增值税 = 销项税额 - 进项税额
}

export async function getTaxSummary(period: string = currentPeriod()): Promise<TaxSummary> {
  const invoices = (await db.invoices.toArray()).filter((i) => i.period === period && i.status === 'normal')
  let salesAmount = 0
  let salesTax = 0
  let purchaseAmount = 0
  let purchaseTax = 0
  for (const i of invoices) {
    if (i.type === 'sales') {
      salesAmount += i.amount
      salesTax += i.taxAmount
    } else {
      purchaseAmount += i.amount
      purchaseTax += i.taxAmount
    }
  }
  return {
    period,
    salesAmount: Math.round(salesAmount * 100) / 100,
    salesTax: Math.round(salesTax * 100) / 100,
    purchaseAmount: Math.round(purchaseAmount * 100) / 100,
    purchaseTax: Math.round(purchaseTax * 100) / 100,
    netTax: Math.round((salesTax - purchaseTax) * 100) / 100,
  }
}

export interface TaxReturnRow {
  section: string
  label: string
  amount: number
}

/**
 * 生成简化版增值税申报表行（一般纳税人口径）：按税率分列销售额/进项税额，
 * 并计算应纳税额。复用 getTaxSummary 与发票台账，纯函数、无副作用。
 */
export async function getTaxReturnRows(period: string): Promise<TaxReturnRow[]> {
  const s = await getTaxSummary(period)
  const invoices = (await db.invoices.toArray()).filter((i) => i.period === period && i.status === 'normal')

  const groupByRate = (type: InvoiceType) => {
    const map = new Map<number, { amount: number; tax: number }>()
    for (const i of invoices.filter((x) => x.type === type)) {
      const key = Math.round(i.taxRate * 10000)
      const cur = map.get(key) ?? { amount: 0, tax: 0 }
      cur.amount += i.amount
      cur.tax += i.taxAmount
      map.set(key, cur)
    }
    return map
  }
  const salesByRate = groupByRate('sales')
  const purchaseByRate = groupByRate('purchase')

  const rows: TaxReturnRow[] = []
  rows.push({ section: '一、销售额', label: '销项不含税销售额合计', amount: s.salesAmount })
  for (const [rate, v] of salesByRate) {
    rows.push({
      section: '一、销售额',
      label: `其中：税率 ${(rate / 100).toFixed(0)}% 销售额`,
      amount: Math.round(v.amount * 100) / 100,
    })
  }
  rows.push({ section: '二、销项税额', label: '销项税额合计', amount: s.salesTax })
  rows.push({ section: '三、进项税额', label: '进项税额合计', amount: s.purchaseTax })
  for (const [rate, v] of purchaseByRate) {
    rows.push({
      section: '三、进项税额',
      label: `其中：税率 ${(rate / 100).toFixed(0)}% 进项税额`,
      amount: Math.round(v.tax * 100) / 100,
    })
  }
  rows.push({ section: '四、应纳税额', label: '应纳税额（销项税额－进项税额）', amount: s.netTax })
  return rows
}
