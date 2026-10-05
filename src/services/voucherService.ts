import { db } from '@/db/database'
import type { Voucher, VoucherEntry, VoucherStatus, VoucherVersion } from '@/types/models'
import { generateVoucherNo } from '@/utils/voucherNo'
import { uid } from '@/utils/format'
import { addLog } from './logService'
import { emit } from './webhookService'
import { useUserStore } from '@/store/userStore'

export interface VoucherFilter {
  keyword?: string
  status?: VoucherStatus
  period?: string
  accountCode?: string
  dateRange?: [string, string]
}

/** 借贷是否平衡 */
export function isBalanced(entries: VoucherEntry[]): boolean {
  const debit = entries.reduce((s, e) => s + (e.debit || 0), 0)
  const credit = entries.reduce((s, e) => s + (e.credit || 0), 0)
  return Math.abs(debit - credit) < 0.005
}

export function voucherTotalDebit(entries: VoucherEntry[]): number {
  return entries.reduce((s, e) => s + (e.debit || 0), 0)
}
export function voucherTotalCredit(entries: VoucherEntry[]): number {
  return entries.reduce((s, e) => s + (e.credit || 0), 0)
}

export async function listVouchers(filter: VoucherFilter = {}): Promise<Voucher[]> {
  let list = await db.vouchers.toArray()
  if (filter.status) list = list.filter((v) => v.status === filter.status)
  if (filter.period) list = list.filter((v) => v.period === filter.period)
  if (filter.accountCode) {
    list = list.filter((v) => v.entries.some((e) => e.accountCode === filter.accountCode))
  }
  if (filter.dateRange) {
    const [start, end] = filter.dateRange
    list = list.filter((v) => v.date >= start && v.date <= end)
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    list = list.filter(
      (v) =>
        v.voucherNo.toLowerCase().includes(kw) ||
        v.creator.toLowerCase().includes(kw) ||
        v.entries.some((e) => e.summary.toLowerCase().includes(kw) || e.accountName.toLowerCase().includes(kw)),
    )
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.voucherNo.localeCompare(a.voucherNo)))
  return list
}

export async function getVoucher(id: string): Promise<Voucher | undefined> {
  return db.vouchers.get(id)
}

export interface VoucherInput {
  date: string
  entries: VoucherEntry[]
  remark?: string
  attachments?: string[]
  creator: string
  entityId?: string // 所属账套/主体（合并报表用）
}

/** 新增凭证（保存为草稿） */
export async function saveVoucher(input: VoucherInput): Promise<Voucher> {
  if (!isBalanced(input.entries)) throw new Error('借贷不平衡，无法保存')
  const period = input.date.slice(0, 7)
  const no = await generateVoucherNo(period)
  const voucher: Voucher = {
    id: uid('v_'),
    voucherNo: no,
    date: input.date,
    period,
    entries: input.entries,
    status: 'draft',
    attachments: input.attachments ?? [],
    creator: input.creator,
    createdAt: Date.now(),
    remark: input.remark,
    entityId: input.entityId,
  }
  await db.vouchers.add(voucher)
  await addLog('新增凭证', '凭证管理', `新增凭证 ${no}`)
  void emit('voucher.saved', voucher)
  return voucher
}

export async function updateVoucher(id: string, patch: Partial<Voucher>) {
  await snapshotVoucher(id)
  await db.vouchers.update(id, patch)
  await addLog('编辑凭证', '凭证管理', `编辑凭证 ${patch.voucherNo ?? id}`)
}

export async function auditVoucher(id: string) {
  await snapshotVoucher(id)
  const user = useUserStore.getState().currentUser
  await db.vouchers.update(id, { status: 'audited', auditor: user?.name, auditedAt: Date.now() })
  await addLog('审核凭证', '凭证管理', `审核凭证 ${id}`)
  void emit('voucher.audited', { id })
}

/**
 * 凭证版本快照：在编辑/审核前保存当前凭证完整副本，用于审计追溯。
 * 版本号按该凭证已有快照数 +1。
 */
export async function snapshotVoucher(voucherId: string): Promise<void> {
  const v = await db.vouchers.get(voucherId)
  if (!v) return
  const existing = await db.voucherVersions.where('voucherId').equals(voucherId).toArray()
  const version = existing.length + 1
  const snap: VoucherVersion = {
    id: uid('vv_'),
    voucherId,
    version,
    time: Date.now(),
    snapshot: JSON.parse(JSON.stringify(v)),
  }
  await db.voucherVersions.add(snap)
}

/** 获取某凭证的全部历史版本（按版本升序） */
export async function getVoucherVersions(voucherId: string): Promise<VoucherVersion[]> {
  const list = await db.voucherVersions.where('voucherId').equals(voucherId).toArray()
  list.sort((a, b) => a.version - b.version)
  return list
}

/**
 * 将凭证恢复到指定历史版本：先对当前状态做一次快照（保留可追溯），
 * 再用该版本快照覆盖凭证正文（保留当前 id / 凭证号 / 状态 / 制单人）。
 */
export async function restoreVoucherVersion(versionId: string): Promise<void> {
  const ver = await db.voucherVersions.get(versionId)
  if (!ver) throw new Error('版本记录不存在')
  const snap = ver.snapshot
  if (!snap) throw new Error('该版本快照数据缺失')
  await snapshotVoucher(ver.voucherId)
  await db.vouchers.update(ver.voucherId, {
    date: snap.date,
    period: snap.period,
    entries: snap.entries,
    remark: snap.remark,
    attachments: snap.attachments ?? [],
  })
  await addLog('恢复凭证版本', '凭证管理', `凭证 ${snap.voucherNo} 恢复至第 ${ver.version} 版`)
}

export async function unauditVoucher(id: string) {
  await db.vouchers.update(id, { status: 'pending', auditor: undefined, auditedAt: undefined })
  await addLog('反审核', '凭证管理', `反审核 ${id}`)
}

export async function voidVoucher(id: string) {
  await db.vouchers.update(id, { status: 'void' })
  await addLog('作废凭证', '凭证管理', `作废凭证 ${id}`)
}

/** 复制凭证，生成新编号草稿 */
export async function copyVoucher(id: string): Promise<Voucher> {
  const src = await db.vouchers.get(id)
  if (!src) throw new Error('凭证不存在')
  const period = src.date.slice(0, 7)
  const no = await generateVoucherNo(period)
  const copy: Voucher = {
    ...src,
    id: uid('v_'),
    voucherNo: no,
    status: 'draft',
    attachments: [],
    createdAt: Date.now(),
    auditedAt: undefined,
    auditor: undefined,
  }
  await db.vouchers.add(copy)
  await addLog('复制凭证', '凭证管理', `复制 ${src.voucherNo} -> ${no}`)
  return copy
}

/** 红冲：生成一张借贷反向的已审核凭证 */
export async function reverseVoucher(id: string): Promise<Voucher> {
  const src = await db.vouchers.get(id)
  if (!src) throw new Error('凭证不存在')
  const period = src.date.slice(0, 7)
  const no = await generateVoucherNo(period)
  const reversed: VoucherEntry[] = src.entries.map((e) => ({
    ...e,
    id: uid('e_'),
    debit: e.credit,
    credit: e.debit,
  }))
  const voucher: Voucher = {
    id: uid('v_'),
    voucherNo: no,
    date: new Date().toISOString().slice(0, 10),
    period: no.split('-')[1] + '-' + no.split('-')[2].slice(0, 2),
    entries: reversed,
    status: 'audited',
    attachments: [],
    creator: src.creator,
    auditor: '红冲',
    createdAt: Date.now(),
    auditedAt: Date.now(),
    remark: `红冲 ${src.voucherNo}`,
  }
  await db.vouchers.add(voucher)
  await addLog('红冲凭证', '凭证管理', `红冲 ${src.voucherNo} -> ${no}`)
  return voucher
}

export async function deleteVoucher(id: string) {
  await db.vouchers.delete(id)
  await addLog('删除凭证', '凭证管理', `删除凭证 ${id}`)
}
