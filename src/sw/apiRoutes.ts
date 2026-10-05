/**
 * 本地只读 REST API 的路由解析（纯逻辑，便于单测）。
 * 由 Service Worker 拦截 /api/v1/* 后调用；仅支持 GET，写操作返回 405。
 */
import { db } from './dbProxy'
import type { Table } from 'dexie'

export interface ApiRequest {
  method: string
  path: string // 不含 origin 的路径，如 /api/v1/vouchers
  query: Record<string, string>
}

export interface ApiResult {
  status: number
  body: unknown
}

/** 端点路径段 → IndexedDB 表名（短横线风格，便于 URL 友好） */
export const ENTITY_ROUTES: Record<string, string> = {
  accounts: 'accounts',
  vouchers: 'vouchers',
  contacts: 'contacts',
  'bank-accounts': 'bankAccounts',
  'cash-flows': 'cashFlows',
  invoices: 'invoices',
  assets: 'assets',
  budgets: 'budgets',
  'exchange-rates': 'exchangeRates',
  entities: 'entities',
  goods: 'goods',
  'stock-moves': 'stockMoves',
  logs: 'logs',
  'opening-balances': 'openingBalances',
}

/** 从路径解析实体表名与可选的单条 id（纯函数，可测） */
export function matchEntity(path: string): { table: string; id?: string } | null {
  const clean = path.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '')
  if (!clean) return null
  const segs = clean.split('/')
  const table = ENTITY_ROUTES[segs[0]]
  if (!table) return null
  if (segs.length >= 2 && segs[1]) return { table, id: decodeURIComponent(segs[1]) }
  return { table }
}

const STRING_FILTERS = ['period', 'status', 'entityId', 'type', 'direction', 'category']

async function readCollection(table: string, query: Record<string, string>): Promise<ApiResult> {
  const coll = (db as unknown as Record<string, Table<Record<string, unknown>, string>>)[table]
  let rows = await coll.toArray()
  for (const f of STRING_FILTERS) {
    if (query[f] !== undefined) rows = rows.filter((r) => String(r[f] ?? '') === query[f])
  }
  const total = rows.length
  const limit = Math.min(Number(query.limit) || 100, 1000)
  const offset = Math.max(0, Number(query.offset) || 0)
  const data = rows.slice(offset, offset + limit)
  return {
    status: 200,
    body: {
      table,
      total,
      limit,
      offset,
      count: data.length,
      rows: data,
    },
  }
}

async function readOne(table: string, id: string): Promise<ApiResult> {
  const coll = (db as unknown as Record<string, Table<Record<string, unknown>, string>>)[table]
  const row = await coll.get(id)
  if (!row) return { status: 404, body: { error: 'not_found', id } }
  return { status: 200, body: row }
}

/** 解析只读请求（核心入口）。非 GET → 405；未知端点 → 404；health → 200 */
export async function resolveReadonly(req: ApiRequest): Promise<ApiResult> {
  if (req.method !== 'GET') {
    return { status: 405, body: { error: 'method_not_allowed', message: '本地 API 仅支持 GET' } }
  }
  const path = req.path.replace(/\/\?.*$/, '')
  if (path === '/api/v1' || path === '/api/v1/') {
    return { status: 200, body: { ok: true, service: 'finance-api', version: 'v1', readonly: true } }
  }
  if (path.endsWith('/health') || path === '/api/v1/health') {
    return { status: 200, body: { ok: true, time: Date.now() } }
  }
  const matched = matchEntity(path)
  if (!matched) return { status: 404, body: { error: 'unknown_endpoint', path } }
  if (matched.id) return readOne(matched.table, matched.id)
  return readCollection(matched.table, req.query)
}
