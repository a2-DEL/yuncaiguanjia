/**
 * 演示数据：给系统灌一个小超市 2 个月的真实感流水。
 * 灌完后老板驾驶舱/报表/风险预警全部有数据可看。
 */
import { db } from './database'
import { uid } from '@/utils/format'
import type { Voucher, VoucherEntry, Contact, BankAccount, ArApBill } from '@/types/models'

function entry(summary: string, code: string, name: string, debit: number, credit: number): VoucherEntry {
  return { id: uid('e_'), summary, accountCode: code, accountName: name, debit, credit }
}

export async function seedDemoData(): Promise<void> {
  // 已有数据就不重复灌
  const existingCount = await db.vouchers.count()
  if (existingCount > 0) return

  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const lastMonthD = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonth = `${lastMonthD.getFullYear()}-${String(lastMonthD.getMonth() + 1).padStart(2, '0')}`

  // 1. 银行账户
  const bank: BankAccount = {
    id: uid('bk_'),
    name: '工行基本户',
    type: 'bank',
    currency: 'CNY',
    initialBalance: 86500,
    status: 'active',
  }
  await db.bankAccounts.add(bank)

  // 2. 往来单位
  const contacts: Contact[] = [
    { id: 'c1', name: '宏远科技有限公司', type: 'customer', code: 'KH001' },
    { id: 'c2', name: '星河贸易公司', type: 'customer', code: 'KH002' },
    { id: 'c3', name: '社区便利店联盟', type: 'customer', code: 'KH003' },
    { id: 's1', name: '鼎盛物资批发', type: 'supplier', code: 'GYS001' },
    { id: 's2', name: '旺旺食品经销', type: 'supplier', code: 'GYS002' },
  ]
  for (const c of contacts) await db.contacts.add(c)

  // 3. 凭证：两个月日常流水
  const vouchers: Voucher[] = []
  let vno = 1

  function addVoucher(date: string, entries: VoucherEntry[], remark = '') {
    const period = date.slice(0, 7)
    vouchers.push({
      id: uid('v_'),
      voucherNo: `记-${period}-${String(vno++).padStart(4, '0')}`,
      date,
      period,
      entries,
      status: 'audited',
      attachments: [],
      creator: '系统',
      auditor: '系统',
      auditedAt: Date.now(),
      createdAt: Date.now(),
      remark,
    })
  }

  // 上月
  addVoucher(`${lastMonth}-05`, [
    entry('收宏远科技货款', '1002', '银行存款', 12000, 0),
    entry('收宏远科技货款', '600101', '产品销售收入', 0, 12000),
  ])
  addVoucher(`${lastMonth}-08`, [
    entry('付鼎盛货款', '220201', '应付账款-鼎盛物资', 8000, 0),
    entry('付鼎盛货款', '1002', '银行存款', 0, 8000),
  ])
  addVoucher(`${lastMonth}-10`, [
    entry('交上月房租', '660205', '房租物业费', 4500, 0),
    entry('交上月房租', '1002', '银行存款', 0, 4500),
  ])
  addVoucher(`${lastMonth}-15`, [
    entry('发上月工资', '660203', '工资薪金', 15000, 0),
    entry('发上月工资', '1002', '银行存款', 0, 15000),
  ])
  addVoucher(`${lastMonth}-18`, [
    entry('收星河贸易货款', '1002', '银行存款', 8000, 0),
    entry('收星河贸易货款', '600101', '产品销售收入', 0, 8000),
  ])
  addVoucher(`${lastMonth}-20`, [
    entry('进货-旺旺食品', '1405', '库存商品', 6000, 0),
    entry('进货-旺旺食品', '1002', '银行存款', 0, 6000),
  ])
  addVoucher(`${lastMonth}-22`, [
    entry('水电费', '660206', '水电费', 800, 0),
    entry('水电费', '1002', '银行存款', 0, 800),
  ])
  addVoucher(`${lastMonth}-25`, [
    entry('办公采购', '660201', '办公费', 320, 0),
    entry('办公采购', '1001', '库存现金', 0, 320),
  ])
  addVoucher(`${lastMonth}-28`, [
    entry('收便利店联盟款', '1002', '银行存款', 5500, 0),
    entry('收便利店联盟款', '600101', '产品销售收入', 0, 5500),
  ])

  // 本月
  addVoucher(`${thisMonth}-03`, [
    entry('付鼎盛货款', '220201', '应付账款-鼎盛物资', 5000, 0),
    entry('付鼎盛货款', '1002', '银行存款', 0, 5000),
  ])
  addVoucher(`${thisMonth}-05`, [
    entry('收宏远科技货款', '112201', '应收账款-宏远科技', 15000, 0),
    entry('销售给宏远', '600101', '产品销售收入', 0, 15000),
  ])
  addVoucher(`${thisMonth}-08`, [
    entry('交本月房租', '660205', '房租物业费', 4500, 0),
    entry('交本月房租', '1002', '银行存款', 0, 4500),
  ])
  addVoucher(`${thisMonth}-10`, [
    entry('进货-旺旺食品', '1405', '库存商品', 7200, 0),
    entry('进货未付款', '220201', '应付账款-鼎盛物资', 0, 7200),
  ])
  addVoucher(`${thisMonth}-12`, [
    entry('发本月工资', '660203', '工资薪金', 15000, 0),
    entry('发本月工资', '1002', '银行存款', 0, 15000),
  ])
  addVoucher(`${thisMonth}-15`, [
    entry('收星河贸易款', '1002', '银行存款', 9000, 0),
    entry('收星河贸易款', '600101', '产品销售收入', 0, 9000),
  ])
  addVoucher(`${thisMonth}-18`, [
    entry('打车交通', '660202', '差旅费', 86, 0),
    entry('打车交通', '1001', '库存现金', 0, 86),
  ])
  addVoucher(`${thisMonth}-20`, [
    entry('水电费', '660206', '水电费', 920, 0),
    entry('水电费', '1002', '银行存款', 0, 920),
  ])
  addVoucher(`${thisMonth}-22`, [
    entry('办公采购', '660201', '办公费', 280, 0),
    entry('办公采购', '1001', '库存现金', 0, 280),
  ])
  addVoucher(`${thisMonth}-25`, [
    entry('销售给便利店联盟', '112203', '应收账款-便利店联盟', 6000, 0),
    entry('销售', '600101', '产品销售收入', 0, 6000),
  ])

  for (const v of vouchers) await db.vouchers.add(v)

  // 4. 应收应付单
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 10)
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-10`
  const bills: ArApBill[] = [
    {
      id: uid('bill_'), direction: 'receivable', contactId: 'c1', billNo: 'AR-001',
      date: `${thisMonth}-05`, dueDate: `${thisMonth}-25`, amount: 15000, settled: 0,
      status: 'open', subject: '宏远科技货款', createdAt: Date.now(),
    },
    {
      id: uid('bill_'), direction: 'receivable', contactId: 'c3', billNo: 'AR-002',
      date: `${thisMonth}-25`, dueDate: nextMonthStr, amount: 6000, settled: 0,
      status: 'open', subject: '便利店联盟货款', createdAt: Date.now(),
    },
    {
      id: uid('bill_'), direction: 'payable', contactId: 's1', billNo: 'AP-001',
      date: `${thisMonth}-10`, dueDate: nextMonthStr, amount: 7200, settled: 0,
      status: 'open', subject: '鼎盛物资货款', createdAt: Date.now(),
    },
  ]
  for (const b of bills) await db.arApBills.add(b)
}
