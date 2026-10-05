/**
 * 数据库 schema 单一来源：被应用主库（database.ts）与本地只读 API 的 Service Worker（dbProxy.ts）共用，
 * 避免两端 schema 漂移导致 IndexedDB 打开失败。
 */
import Dexie from 'dexie'

export const DB_NAME = 'FinanceSystemDB'

export function applySchema(db: Dexie): void {
  db.version(1).stores({
    accounts: 'id, code, parentCode, type, status, isLeaf',
    vouchers: 'id, voucherNo, date, period, status, creator, createdAt',
    attachments: 'id, createdAt',
    roles: 'key',
    users: 'id, username, role',
    logs: 'id, module, time, userId',
    settings: 'key',
  })
  db.version(2).stores({
    bankAccounts: 'id, type, status, name',
    cashFlows: 'id, date, period, accountId, type, reconciled, createdAt',
    contacts: 'id, type, code, name',
    arApBills: 'id, direction, contactId, status, date, dueDate',
    assets: 'id, code, category, status',
    depreciations: 'id, assetId, period',
    expenseClaims: 'id, claimNo, applicant, status, date, createdAt',
    invoices: 'id, type, invoiceNo, period, status',
  })
  db.version(3).stores({ closings: 'period, closedAt' })
  db.version(4).stores({ openingBalances: 'id, year' })
  db.version(5).stores({ budgets: 'id, period, accountCode' })
  db.version(6).stores({ budgets: 'id, period, accountCode, periodType' })
  db.version(7).stores({ exchangeRates: 'id, currency, date' })
  db.version(8).stores({
    goods: 'id, code, name, category, status',
    stockMoves: 'id, goodsId, date, period, type',
  })
  db.version(9).stores({ voucherVersions: 'id, voucherId, version, time' })
  db.version(10).stores({ entities: 'id, name, currency, parentId, isGroup' })
  db.version(11).stores({
    vouchers: 'id, voucherNo, date, period, status, creator, createdAt, entityId',
  })
  db.version(12).stores({ webhooks: 'id, event, enabled' })
  // 合规审计：操作日志哈希链（防篡改），以 hash 索引支持快速校验
  db.version(13).stores({
    logs: 'id, module, time, userId, hash',
  })
  // AI 助手：按用户隔离的模型接入配置（API Key 本机保存）
  db.version(14).stores({
    aiConfigs: 'id, userId, provider, enabled',
  })
  // Agent 团队：岗位产出的待批任务（人审闸门）
  db.version(15).stores({
    proposals: 'id, role, kind, status, createdAt',
  })
}
