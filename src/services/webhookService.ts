/**
 * 开放互通 · Webhook 出站通知。
 * 用户在设置页配置回调地址；关键业务事件（凭证/发票/结账/备份）通过 emit 推送 JSON 负载，
 * 可选 HMAC-SHA256 签名（头 X-Signature: sha256=<hex>）。推送为 fire-and-forget，失败不阻塞主流程。
 */
import { db } from '@/db/database'
import { uid } from '@/utils/format'
import { hmacSha256 } from '@/utils/crypto'
import { addLog } from '@/services/logService'
import type { Webhook } from '@/types/models'

export const WEBHOOK_EVENTS = [
  'voucher.saved',
  'voucher.audited',
  'invoice.created',
  'period.closed',
  'backup.exported',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

function eventMatches(hookEvent: string, event: string): boolean {
  if (hookEvent === '*') return true
  if (hookEvent === event) return true
  if (hookEvent.endsWith('.*')) return event.startsWith(hookEvent.slice(0, -1))
  return false
}

export async function listWebhooks(): Promise<Webhook[]> {
  const list = await db.webhooks.toArray()
  list.sort((a, b) => a.createdAt - b.createdAt)
  return list
}

export async function saveWebhook(input: Omit<Webhook, 'id' | 'createdAt'>): Promise<void> {
  const webhook: Webhook = { ...input, id: uid('wh_'), createdAt: Date.now() }
  await db.webhooks.add(webhook)
  await addLog('新增Webhook', '开放互通', `事件 ${input.event} → ${input.url}`)
}

export async function updateWebhook(id: string, patch: Partial<Omit<Webhook, 'id' | 'createdAt'>>): Promise<void> {
  await db.webhooks.update(id, patch)
}

export async function deleteWebhook(id: string): Promise<void> {
  await db.webhooks.delete(id)
}

async function postOne(hook: Webhook, event: string, payload: unknown): Promise<number> {
  const body = JSON.stringify({ event, time: Date.now(), payload })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (hook.secret) headers['X-Signature'] = 'sha256=' + (await hmacSha256(body, hook.secret))
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(hook.url, { method: 'POST', headers, body, signal: ctrl.signal })
    return res.status
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 触发事件：向所有匹配且启用的 Webhook 推送。失败仅记录日志，不影响主流程。
 * 每条最多重试 1 次（网络/5xx 场景）。
 */
export async function emit(event: string, payload: unknown): Promise<void> {
  let hooks: Webhook[] = []
  try {
    hooks = (await db.webhooks.toArray()).filter((h) => h.enabled && eventMatches(h.event, event))
  } catch {
    return
  }
  for (const hook of hooks) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await postOne(hook, event, payload)
        break
      } catch (err) {
        if (attempt === 1) {
          console.error('[webhook] 推送失败', hook.url, event, err)
          await addLog('Webhook推送失败', '开放互通', `${event} → ${hook.url}`).catch(() => {})
        }
      }
    }
  }
}

/** 测试推送：向该 Webhook 发送一条示例负载并返回 HTTP 状态码（异常返回 0） */
export async function testWebhook(hook: Webhook): Promise<number> {
  try {
    return await postOne(hook, 'test', { message: '这是一条来自云财管家的测试推送', time: Date.now() })
  } catch {
    return 0
  }
}
