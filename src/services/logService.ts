import { db } from '@/db/database'
import { uid } from '@/utils/format'
import { useUserStore } from '@/store/userStore'
import { sha256Hex } from '@/utils/crypto'
import type { OperationLog } from '@/types/models'

/** 计算单条日志的链式哈希：依赖上一条哈希 + 本记录关键字段 */
export async function computeLogHash(prevHash: string, log: Pick<OperationLog, 'action' | 'module' | 'detail' | 'userId' | 'userName' | 'time'>): Promise<string> {
  const payload = [
    prevHash,
    log.action,
    log.module,
    log.detail,
    log.userId,
    log.userName,
    String(log.time),
  ].join('|')
  return sha256Hex(payload)
}

/** 记录操作日志（写入不强制拦截，仅留痕），并写入防篡改哈希链 */
export async function addLog(action: string, module: string, detail: string) {
  const user = useUserStore.getState().currentUser
  const userId = user?.id ?? 'system'
  const userName = user?.name ?? '系统'
  const time = Date.now()
  // 取上一条日志的哈希作为链前指针
  const last = await db.logs.orderBy('time').reverse().first()
  const prevHash = last?.hash ?? ''
  const hash = await computeLogHash(prevHash, { action, module, detail, userId, userName, time })
  await db.logs.add({ id: uid('l_'), action, module, detail, userId, userName, time, hash, prevHash })
}

export interface LogQuery {
  module?: string
  userName?: string
  keyword?: string
  page?: number
  pageSize?: number
}

/** 查询操作日志（按时间倒序，支持模块/操作人/关键字筛选与分页） */
export async function queryLogs(q: LogQuery = {}) {
  const coll = db.logs
    .orderBy('time')
    .reverse()
    .filter((l) => {
      if (q.module && l.module !== q.module) return false
      if (q.userName && !l.userName.includes(q.userName)) return false
      if (q.keyword && !(l.detail.includes(q.keyword) || l.action.includes(q.keyword))) return false
      return true
    })
  const total = await coll.count()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 10
  const rows = await coll.offset((page - 1) * pageSize).limit(pageSize).toArray()
  return { rows, total }
}

/** 全部出现过的模块（用于筛选下拉） */
export async function listLogModules(): Promise<string[]> {
  const keys = await db.logs.orderBy('module').uniqueKeys()
  return (keys as string[]).sort()
}

export interface LogChainVerification {
  ok: boolean // 整条链是否未被篡改
  tampered: OperationLog[] // 被篡改（或链断裂）的记录
  count: number // 参与校验的日志条数
}

/**
 * 校验审计日志哈希链完整性：按时间升序重算每条哈希并与存储值比对，
 * 同时验证 prevHash 是否指向上一条的真实哈希。任一条不一致即判定被篡改。
 */
export async function verifyLogChain(): Promise<LogChainVerification> {
  const logs = await db.logs.orderBy('time').toArray()
  const tampered: OperationLog[] = []
  let prevHash = ''
  for (const log of logs) {
    // 未上链（历史数据）跳过 prevHash 校验，但若有 hash 仍需校验
    const expected = await computeLogHash(prevHash, {
      action: log.action,
      module: log.module,
      detail: log.detail,
      userId: log.userId,
      userName: log.userName,
      time: log.time,
    })
    const hashMismatch = log.hash !== undefined && log.hash !== expected
    const prevMismatch = log.prevHash !== undefined && log.prevHash !== prevHash
    if (hashMismatch || prevMismatch) tampered.push(log)
    prevHash = log.hash ?? expected
  }
  return { ok: tampered.length === 0, tampered, count: logs.length }
}
