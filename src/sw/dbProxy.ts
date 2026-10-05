/**
 * Service Worker 内的本地只读 Dexie 实例。与应用的 database.ts 共用 applySchema，
 * 打开同一 IndexedDB（同源共享），仅用于只读查询，不做写入。
 */
import Dexie from 'dexie'
import { applySchema, DB_NAME } from '@/db/schema'

export const db = new Dexie(DB_NAME)
applySchema(db)
