import { db } from '@/db/database'
import type { Asset, DepreciationRecord, AssetCategory, VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { saveVoucher } from './voucherService'
import { getAccount } from './accountService'
import { useUserStore } from '@/store/userStore'

export async function listAssets(): Promise<Asset[]> {
  return db.assets.orderBy('code').toArray()
}

export async function createAsset(data: Omit<Asset, 'id' | 'accumulatedDepreciation' | 'status'> & { status?: Asset['status'] }): Promise<Asset> {
  const asset: Asset = {
    id: uid('as_'),
    accumulatedDepreciation: 0,
    status: data.status ?? 'in_use',
    ...data,
  }
  await db.assets.add(asset)
  await addLog('新增资产', '固定资产', `新增资产 ${data.code} ${data.name}`)
  return asset
}

export async function updateAsset(id: string, patch: Partial<Asset>) {
  await db.assets.update(id, patch)
  await addLog('编辑资产', '固定资产', `编辑资产 ${id}`)
}

export async function disposeAsset(id: string) {
  await db.assets.update(id, { status: 'disposed' })
  await addLog('清理资产', '固定资产', `清理资产 ${id}`)
}

/** 计算某资产某月应计提折旧额 */
export function calcMonthlyDepreciation(asset: Asset): number {
  const salvage = asset.originalValue * asset.salvageRate
  const depreciable = asset.originalValue - salvage
  if (asset.depreciationMethod === 'double') {
    const book = asset.originalValue - asset.accumulatedDepreciation
    const monthly = (book * 2) / asset.usefulLife
    const remain = book - salvage
    return Math.max(0, Math.min(monthly, remain))
  }
  const monthly = depreciable / asset.usefulLife
  const remain = depreciable - asset.accumulatedDepreciation
  return Math.max(0, Math.min(monthly, remain))
}

export interface RunResult {
  count: number
  total: number
  voucherNo?: string // 合并计提折旧凭证号
}

/** 期末计提折旧：对使用中资产生成本期折旧记录（按期间幂等），并生成一张合并折旧凭证 */
export async function runDepreciation(period: string): Promise<RunResult> {
  const assets = await db.assets.filter((a) => a.status === 'in_use').toArray()
  const newRecordIds: string[] = []
  let count = 0
  let total = 0
  for (const asset of assets) {
    const existing = await db.depreciations.where('assetId').equals(asset.id).and((r) => r.period === period).count()
    if (existing > 0) continue
    const amount = Math.round(calcMonthlyDepreciation(asset) * 100) / 100
    if (amount <= 0) continue
    const accumulated = Math.round((asset.accumulatedDepreciation + amount) * 100) / 100
    const record: DepreciationRecord = {
      id: uid('dp_'),
      assetId: asset.id,
      period,
      amount,
      accumulated,
      createdAt: Date.now(),
    }
    await db.depreciations.add(record)
    await db.assets.update(asset.id, { accumulatedDepreciation: accumulated })
    newRecordIds.push(record.id)
    count++
    total += amount
  }
  total = Math.round(total * 100) / 100
  let voucherNo: string | undefined
  if (count > 0) {
    const user = useUserStore.getState().currentUser?.name ?? '系统'
    const entries: VoucherEntry[] = [
      {
        id: uid('e_'),
        summary: `计提折旧 ${period}`,
        accountCode: '6602',
        accountName: (await getAccount('6602'))?.name ?? '管理费用',
        debit: total,
        credit: 0,
      },
      {
        id: uid('e_'),
        summary: `计提折旧 ${period}`,
        accountCode: '1602',
        accountName: (await getAccount('1602'))?.name ?? '累计折旧',
        debit: 0,
        credit: total,
      },
    ]
    const voucher = await saveVoucher({ date: `${period}-01`, entries, remark: `计提折旧 ${period}`, creator: user })
    voucherNo = voucher.voucherNo
    for (const rid of newRecordIds) {
      await db.depreciations.update(rid, { voucherNo })
    }
  }
  await addLog('计提折旧', '固定资产', `计提 ${period} 折旧 ${count} 笔，合计 ¥${total.toFixed(2)}${voucherNo ? `（凭证 ${voucherNo}）` : ''}`)
  return { count, total, voucherNo }
}

// ===================== 期初折旧补录 =====================
export interface DepreciationOpeningInfo {
  cardTotal: number // 资产卡片累计折旧合计
  ledgerTotal: number // 总账 1602（累计折旧）已审核凭证余额
  diff: number // 应补录差额 = 卡片合计 - 总账余额
  reconciled: boolean // 已对齐（差额<=0）
}

/** 对账：资产卡片累计折旧合计 vs 总账 1602 余额 */
export async function getDepreciationOpeningInfo(): Promise<DepreciationOpeningInfo> {
  const assets = await db.assets.toArray()
  const cardTotal = Math.round(assets.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0) * 100) / 100
  const vouchers = await db.vouchers.where('status').equals('audited').toArray()
  let ledgerTotal = 0
  for (const v of vouchers) {
    for (const e of v.entries) {
      if (e.accountCode === '1602') ledgerTotal += (e.credit - e.debit)
    }
  }
  ledgerTotal = Math.round(ledgerTotal * 100) / 100
  const diff = Math.round((cardTotal - ledgerTotal) * 100) / 100
  return { cardTotal, ledgerTotal, diff, reconciled: diff <= 0 }
}

/** 一次性补录期初累计折旧，使总账 1602 与资产卡片一致（差额法，天然幂等） */
export async function runDepreciationOpening(period: string): Promise<{ voucherNo: string }> {
  const info = await getDepreciationOpeningInfo()
  if (info.diff <= 0) throw new Error('无需补录：总账累计折旧已与资产卡片一致')
  const user = useUserStore.getState().currentUser?.name ?? '系统'
  const amount = info.diff
  const entries: VoucherEntry[] = [
    {
      id: uid('e_'),
      summary: `期初累计折旧补录 ${period}`,
      accountCode: '3104',
      accountName: (await getAccount('3104'))?.name ?? '利润分配',
      debit: amount,
      credit: 0,
    },
    {
      id: uid('e_'),
      summary: `期初累计折旧补录 ${period}`,
      accountCode: '1602',
      accountName: (await getAccount('1602'))?.name ?? '累计折旧',
      debit: 0,
      credit: amount,
    },
  ]
  const voucher = await saveVoucher({
    date: `${period}-01`,
    entries,
    remark: `期初累计折旧补录（对齐资产卡片）${period}`,
    creator: user,
  })
  await addLog('期初折旧补录', '固定资产', `补录期初累计折旧 ¥${amount.toFixed(2)}，生成凭证 ${voucher.voucherNo}`)
  return { voucherNo: voucher.voucherNo }
}

export async function listDepreciations(period?: string): Promise<DepreciationRecord[]> {
  let list = await db.depreciations.toArray()
  if (period) list = list.filter((r) => r.period === period)
  list.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))
  return list
}

export interface AssetSummary {
  totalCount: number
  originalTotal: number
  accumulatedTotal: number
  netTotal: number
  byCategory: { category: AssetCategory; original: number; accumulated: number }[]
}

export async function getAssetSummary(): Promise<AssetSummary> {
  const assets = await listAssets()
  const byCategoryMap = new Map<AssetCategory, { original: number; accumulated: number }>()
  let originalTotal = 0
  let accumulatedTotal = 0
  for (const a of assets) {
    originalTotal += a.originalValue
    accumulatedTotal += a.accumulatedDepreciation
    const cur = byCategoryMap.get(a.category) || { original: 0, accumulated: 0 }
    cur.original += a.originalValue
    cur.accumulated += a.accumulatedDepreciation
    byCategoryMap.set(a.category, cur)
  }
  return {
    totalCount: assets.length,
    originalTotal,
    accumulatedTotal,
    netTotal: originalTotal - accumulatedTotal,
    byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({ category, ...v })),
  }
}
