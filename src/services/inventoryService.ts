import { db } from '@/db/database'
import type { Good, StockMove, StockMoveType, VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from '@/services/logService'
import { saveVoucher } from '@/services/voucherService'
import { useUserStore } from '@/store/userStore'

/** 进销存关联科目（可据实际科目表调整） */
const ACC = {
  goods: '1405', goodsName: '库存商品',
  bank: '1002', bankName: '银行存款',
  revenue: '6001', revenueName: '主营业务收入',
  cost: '6401', costName: '主营业务成本',
}

export async function listGoods(): Promise<Good[]> {
  return db.goods.orderBy('code').toArray()
}

export async function createGood(data: Omit<Good, 'id' | 'status'> & { status?: Good['status'] }): Promise<Good> {
  const good: Good = { id: uid('g_'), status: data.status ?? 'active', ...data }
  await db.goods.add(good)
  await addLog('新增商品', '进销存', `新增商品 ${data.code} ${data.name}`)
  return good
}

export interface StockMoveInput {
  goodsId: string
  type: StockMoveType
  qty: number
  price: number
  date?: string
  remark?: string
}

/**
 * 出入库并自动生成凭证：
 * - 入库（采购）：借 库存商品 / 贷 银行存款
 * - 出库（销售）：借 银行存款 / 贷 主营业务收入；同时结转成本 借 主营业务成本 / 贷 库存商品
 */
export async function createStockMove(input: StockMoveInput): Promise<{ move: StockMove; voucherNo: string }> {
  const good = await db.goods.get(input.goodsId)
  if (!good) throw new Error('商品不存在')
  if (input.qty <= 0 || input.price < 0) throw new Error('数量/单价不合法')
  const amount = Math.round(input.qty * input.price * 100) / 100
  const date = input.date || new Date().toISOString().slice(0, 10)
  const period = date.slice(0, 7)
  const summary = `${input.type === 'in' ? '采购入库' : '销售出库'}-${good.name}`
  const move: StockMove = {
    id: uid('sm_'), goodsId: good.id, goodsName: good.name, date, period,
    type: input.type, qty: input.qty, price: input.price, amount, remark: input.remark,
  }
  await db.stockMoves.add(move)

  const entries: VoucherEntry[] = []
  if (input.type === 'in') {
    entries.push({ id: uid('e_'), summary, accountCode: ACC.goods, accountName: ACC.goodsName, debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: ACC.bank, accountName: ACC.bankName, debit: 0, credit: amount })
  } else {
    entries.push({ id: uid('e_'), summary, accountCode: ACC.bank, accountName: ACC.bankName, debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary, accountCode: ACC.revenue, accountName: ACC.revenueName, debit: 0, credit: amount })
    entries.push({ id: uid('e_'), summary: `结转成本-${good.name}`, accountCode: ACC.cost, accountName: ACC.costName, debit: amount, credit: 0 })
    entries.push({ id: uid('e_'), summary: `结转成本-${good.name}`, accountCode: ACC.goods, accountName: ACC.goodsName, debit: 0, credit: amount })
  }

  const user = useUserStore.getState().currentUser?.name ?? 'system'
  const voucher = await saveVoucher({ date, entries, remark: summary, creator: user })
  await db.stockMoves.update(move.id, { voucherNo: voucher.voucherNo })
  await addLog('出入库', '进销存', `${summary} ¥${amount.toFixed(2)}，凭证 ${voucher.voucherNo}`)
  return { move: { ...move, voucherNo: voucher.voucherNo }, voucherNo: voucher.voucherNo }
}

export async function listStockMoves(period?: string): Promise<StockMove[]> {
  let list = await db.stockMoves.toArray()
  if (period) list = list.filter((m) => m.period === period)
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}

export interface InventorySummary {
  goodsCount: number
  inAmount: number
  outAmount: number
}

export async function getInventorySummary(period?: string): Promise<InventorySummary> {
  const moves = await listStockMoves(period)
  let inAmount = 0
  let outAmount = 0
  for (const m of moves) {
    if (m.type === 'in') inAmount += m.amount
    else outAmount += m.amount
  }
  return { goodsCount: (await listGoods()).length, inAmount, outAmount }
}
