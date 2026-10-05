/**
 * 开放互通 · 数据导出：全量 JSON 快照 + 单实体 CSV/JSON 导出。
 * 数据完全在本地生成（IndexedDB 读取），不上传任何后端。
 */
import { db } from '@/db/database'
import { exportCsv, exportJson, type ExportSheet } from '@/utils/exporter'

export const EXPORTABLE_ENTITIES = [
  'accounts', 'vouchers', 'contacts', 'bankAccounts', 'cashFlows', 'invoices',
  'assets', 'budgets', 'exchangeRates', 'entities', 'goods', 'stockMoves',
  'logs', 'openingBalances',
] as const
export type ExportableEntity = (typeof EXPORTABLE_ENTITIES)[number]

export const ENTITY_LABEL: Record<ExportableEntity, string> = {
  accounts: '会计科目',
  vouchers: '记账凭证',
  contacts: '往来单位',
  bankAccounts: '银行账户',
  cashFlows: '资金流水',
  invoices: '发票',
  assets: '固定资产',
  budgets: '预算',
  exchangeRates: '汇率',
  entities: '核算主体',
  goods: '商品',
  stockMoves: '库存变动',
  logs: '操作日志',
  openingBalances: '期初余额',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return value as string | number
}

/** 将对象数组转换为 CSV 表（嵌套字段 JSON 化） */
function recordsToSheet(records: Array<Record<string, unknown>>): ExportSheet {
  const header = Array.from(
    records.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k))
      return set
    }, new Set<string>()),
  )
  return {
    name: 'data',
    header,
    rows: records.map((r) => header.map((h) => cell(r[h]))),
  }
}

/** 导出全部实体为一份结构化 JSON（外部 ETL 一键接入） */
export async function exportAllJson(filename = `finance-full-${today()}.json`): Promise<number> {
  const data: Record<string, unknown[]> = {}
  for (const name of EXPORTABLE_ENTITIES) {
    data[name] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[name].toArray()
  }
  exportJson(filename, { exportedAt: Date.now(), schemaVersion: 13, data })
  return EXPORTABLE_ENTITIES.reduce((sum, n) => sum + (data[n]?.length ?? 0), 0)
}

/** 导出单个实体为 JSON */
export async function exportEntityJson(
  entity: ExportableEntity,
  filename = `${entity}-${today()}.json`,
): Promise<void> {
  const rows = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[entity].toArray()
  exportJson(filename, { entity, exportedAt: Date.now(), rows })
}

/** 导出单个实体为 CSV（嵌套字段将以 JSON 字符串呈现） */
export async function exportEntityCsv(
  entity: ExportableEntity,
  filename = `${entity}-${today()}.csv`,
): Promise<void> {
  const rows = (await (
    db as unknown as Record<string, { toArray: () => Promise<Array<Record<string, unknown>>> }>
  )[entity].toArray()) as Array<Record<string, unknown>>
  exportCsv(filename, recordsToSheet(rows))
}

/** 导出审计追溯包：操作日志全量 + 哈希链完整性校验结果（合规留痕） */
export async function exportAuditTrail(filename = `audit-trail-${today()}.json`): Promise<{ count: number; ok: boolean }> {
  const logs = await db.logs.orderBy('time').toArray()
  const { verifyLogChain } = await import('@/services/logService')
  const verification = await verifyLogChain()
  exportJson(filename, {
    exportedAt: Date.now(),
    schemaVersion: 13,
    integrity: { ok: verification.ok, tamperedCount: verification.tampered.length },
    logs,
  })
  return { count: logs.length, ok: verification.ok }
}
