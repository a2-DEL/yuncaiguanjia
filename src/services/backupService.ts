import { db } from '@/db/database'
import { encryptText, decryptText } from '@/utils/crypto'
import { addLog } from '@/services/logService'
import { emit } from '@/services/webhookService'

/** 参与备份的全部数据表（与 database.ts 保持一致） */
const TABLES = [
  'accounts', 'vouchers', 'attachments', 'roles', 'users', 'logs', 'settings',
  'bankAccounts', 'cashFlows', 'contacts', 'arApBills', 'assets', 'depreciations',
  'expenseClaims', 'invoices', 'closings', 'openingBalances', 'budgets', 'exchangeRates',
] as const

export type BackupTableName = (typeof TABLES)[number]

export interface BackupFile {
  app: 'finance-system'
  version: number
  exportedAt: number
  encrypted: boolean
  salt?: string
  iv?: string
  payload: string // JSON 明文，或加密后的 base64 密文
}

const BACKUP_VERSION = 1

type Payload = Record<BackupTableName, unknown[]>

async function gatherPayload(): Promise<Payload> {
  const payload = {} as Payload
  for (const t of TABLES) {
    payload[t] = await (db as any)[t].toArray()
  }
  return payload
}

/** 导出备份；传入 password 则 AES-GCM 加密，否则明文 JSON */
export async function exportBackup(password?: string): Promise<BackupFile> {
  const json = JSON.stringify(await gatherPayload())
  if (password) {
    const blob = await encryptText(json, password)
    await addLog('数据备份', '系统设置', '导出加密备份')
    void emit('backup.exported', { encrypted: true })
    return { app: 'finance-system', version: BACKUP_VERSION, exportedAt: Date.now(), encrypted: true, salt: blob.salt, iv: blob.iv, payload: blob.data }
  }
  await addLog('数据备份', '系统设置', '导出明文备份')
  void emit('backup.exported', { encrypted: false })
  return { app: 'finance-system', version: BACKUP_VERSION, exportedAt: Date.now(), encrypted: false, payload: json }
}

/** 导入备份：解密（如有）、校验、清空并写入各表。此操作会覆盖当前全部数据，调用方需先确认 */
export async function importBackup(file: BackupFile, password?: string): Promise<void> {
  if (file.app !== 'finance-system') throw new Error('不是本系统的备份文件')
  if (file.version > BACKUP_VERSION) throw new Error('备份文件版本过高，请升级系统后导入')

  let json: string
  if (file.encrypted) {
    if (!password) throw new Error('该备份已加密，请输入密码')
    json = await decryptText({ salt: file.salt!, iv: file.iv!, data: file.payload }, password)
  } else {
    json = file.payload
  }

  const data = JSON.parse(json) as Partial<Payload>
  for (const t of TABLES) {
    if (!Array.isArray(data[t])) throw new Error(`备份文件缺少数据表：${t}`)
  }

  for (const t of TABLES) {
    await (db as any)[t].clear()
    const rows = data[t] as any[]
    if (rows.length) await (db as any)[t].bulkAdd(rows)
  }
  await addLog('数据恢复', '系统设置', '导入备份并覆盖当前数据')
}

/** 浏览器端：触发下载备份文件 */
export function downloadBackupFile(file: BackupFile, filename?: string): void {
  const name = filename ?? `finance-backup-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 浏览器端：读取用户选择的备份文件 */
export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text()
  return JSON.parse(text) as BackupFile
}
