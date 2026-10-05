/**
 * 集团合并报表服务：多账套（主体）按其本位币试算平衡，再按指定汇率折算为集团本位币（CNY）后合并。
 * 说明：集团内部抵销分录的账务口径为后续待确认项，此处先完成多币种折算汇总。
 */
import { db } from '@/db/database'
import { uid } from '@/utils/format'
import { getRate, currencyLabel, FOREIGN_CURRENCIES } from './exchangeRateService'
import { listAccounts } from './accountService'
import { addLog } from './logService'
import type { Entity, Voucher } from '@/types/models'

export const DEFAULT_ENTITY_ID = 'ent_main'

export interface EntityTrialBalanceRow {
  accountCode: string
  accountName: string
  debit: number // 该主体本位币金额
  credit: number
}

export interface ConsolidatedTrialBalanceRow {
  accountCode: string
  accountName: string
  debit: number // 折算后集团本位币 CNY
  credit: number
  byEntity: Record<string, { debit: number; credit: number }> // 各主体折算后金额（下钻）
}

/** 首次使用时确保存在默认总部主体 */
export async function ensureDefaultEntity(): Promise<void> {
  const count = await db.entities.count()
  if (count === 0) {
    await db.entities.add({ id: DEFAULT_ENTITY_ID, name: '总部（人民币账套）', currency: 'CNY', isGroup: true })
  }
}

export async function listEntities(): Promise<Entity[]> {
  await ensureDefaultEntity()
  return db.entities.toArray()
}

export async function addEntity(input: { name: string; currency: string; parentId?: string }): Promise<Entity> {
  const entity: Entity = { id: uid('ent_'), name: input.name, currency: input.currency, parentId: input.parentId }
  await db.entities.add(entity)
  await addLog('新增合并主体', '合并报表', `新增主体 ${input.name}（${currencyLabel(input.currency)}）`)
  return entity
}

/** 取某主体在指定期间的试算平衡（金额为其本位币） */
async function getEntityTrialBalance(entity: Entity, period: string): Promise<EntityTrialBalanceRow[]> {
  const vouchers = (await db.vouchers.toArray()).filter((v: Voucher) => {
    if (v.status === 'void') return false
    if (v.isElimination) return false // 内部抵销分录不计入各主体试算
    if (v.period !== period) return false
    // 未指定 entityId 的凭证归属默认（集团）主体
    if (entity.id === DEFAULT_ENTITY_ID) return !v.entityId || v.entityId === DEFAULT_ENTITY_ID
    return v.entityId === entity.id
  })
  const accountMap = new Map<string, string>()
  ;(await listAccounts()).forEach((a) => accountMap.set(a.code, a.name))
  const acc = new Map<string, { debit: number; credit: number }>()
  for (const v of vouchers) {
    for (const e of v.entries) {
      const cur = acc.get(e.accountCode) ?? { debit: 0, credit: 0 }
      cur.debit += e.debit || 0
      cur.credit += e.credit || 0
      acc.set(e.accountCode, cur)
    }
  }
  return Array.from(acc.entries()).map(([code, val]) => ({
    accountCode: code,
    accountName: accountMap.get(code) ?? code,
    debit: Math.round(val.debit * 100) / 100,
    credit: Math.round(val.credit * 100) / 100,
  }))
}

/**
 * 集团合并试算平衡：各主体按其本位币试算，再按 rateDate 汇率折算为集团本位币（CNY）后加总。
 */
export async function getConsolidatedTrialBalance(period: string, rateDate: string): Promise<ConsolidatedTrialBalanceRow[]> {
  const entities = await listEntities()
  const consolidated = new Map<string, ConsolidatedTrialBalanceRow>()

  for (const entity of entities) {
    const rate = (await getRate(entity.currency, rateDate)) ?? 1
    const tb = await getEntityTrialBalance(entity, period)
    for (const row of tb) {
      const debitCNY = Math.round(row.debit * rate * 100) / 100
      const creditCNY = Math.round(row.credit * rate * 100) / 100
      const cur = consolidated.get(row.accountCode) ?? {
        accountCode: row.accountCode,
        accountName: row.accountName,
        debit: 0,
        credit: 0,
        byEntity: {},
      }
      cur.debit += debitCNY
      cur.credit += creditCNY
      const prev = cur.byEntity[entity.id] ?? { debit: 0, credit: 0 }
      cur.byEntity[entity.id] = {
        debit: Math.round((prev.debit + debitCNY) * 100) / 100,
        credit: Math.round((prev.credit + creditCNY) * 100) / 100,
      }
      consolidated.set(row.accountCode, cur)
    }
  }

  return Array.from(consolidated.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

/**
 * 下钻：取某科目在指定期间、可选主体下的全部凭证分录（合并报表从合并行穿透到明细凭证）。
 */
export async function getVouchersByAccount(accountCode: string, period: string, entityId?: string): Promise<Voucher[]> {
  const all = await db.vouchers.toArray()
  return all.filter((v: Voucher) => {
    if (v.status === 'void') return false
    if (v.period !== period) return false
    if (entityId && v.entityId !== entityId) return false
    if (!entityId && v.entityId) return false // 未指定主体时仅看无归属（总部）凭证
    return v.entries.some((e) => e.accountCode === accountCode)
  })
}

/**
 * 集团内部抵销分录汇总：把标记 isElimination 的凭证按其主体本位币折算为集团本位币（CNY）后合并，
 * 单独列示（不计入各主体试算，用于展示内部往来/内部交易抵销的影响）。
 */
export async function getConsolidatedEliminations(period: string, rateDate: string): Promise<ConsolidatedTrialBalanceRow[]> {
  const entities = await listEntities()
  const entityMap = new Map(entities.map((e) => [e.id, e]))
  const elimVouchers = (await db.vouchers.toArray()).filter((v: Voucher) => {
    if (v.status === 'void') return false
    if (!v.isElimination) return false
    return v.period === period
  })
  const accountMap = new Map<string, string>()
  ;(await listAccounts()).forEach((a) => accountMap.set(a.code, a.name))
  const consolidated = new Map<string, ConsolidatedTrialBalanceRow>()
  const fallbackEntity = entities[0]
  for (const v of elimVouchers) {
    const entity = (v.entityId && entityMap.get(v.entityId)) || fallbackEntity
    const rate = entity ? (await getRate(entity.currency, rateDate)) ?? 1 : 1
    for (const e of v.entries) {
      const debitCNY = Math.round((e.debit || 0) * rate * 100) / 100
      const creditCNY = Math.round((e.credit || 0) * rate * 100) / 100
      const cur = consolidated.get(e.accountCode) ?? {
        accountCode: e.accountCode,
        accountName: e.accountName || accountMap.get(e.accountCode) || e.accountCode,
        debit: 0,
        credit: 0,
        byEntity: {},
      }
      cur.debit += debitCNY
      cur.credit += creditCNY
      const prev = cur.byEntity[v.entityId ?? ''] ?? { debit: 0, credit: 0 }
      cur.byEntity[v.entityId ?? ''] = {
        debit: Math.round((prev.debit + debitCNY) * 100) / 100,
        credit: Math.round((prev.credit + creditCNY) * 100) / 100,
      }
      consolidated.set(e.accountCode, cur)
    }
  }
  return Array.from(consolidated.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

export { FOREIGN_CURRENCIES }
