import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listWebhooks, saveWebhook, emit, testWebhook } from '@/services/webhookService'
import { db } from '@/db/database'

const fetchMock = vi.fn()
beforeEach(async () => {
  await db.webhooks.clear()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, ok: true } as Response)
})

describe('webhookService', () => {
  it('保存与列出 Webhook', async () => {
    await saveWebhook({ event: 'voucher.saved', url: 'https://x.test/h', enabled: true })
    const list = await listWebhooks()
    expect(list.length).toBe(1)
    expect(list[0].event).toBe('voucher.saved')
  })

  it('emit 命中事件时 POST JSON 且含签名头（secret 配置时）', async () => {
    await saveWebhook({ event: 'voucher.saved', url: 'https://x.test/h', secret: 's3cr3t', enabled: true })
    await emit('voucher.saved', { id: 'v1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.test/h')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(String(init.headers['X-Signature'])).toMatch(/^sha256=/)
    const body = JSON.parse(init.body)
    expect(body.event).toBe('voucher.saved')
  })

  it('通配事件 * 可命中任意事件', async () => {
    await saveWebhook({ event: '*', url: 'https://x.test/all', enabled: true })
    await emit('invoice.created', { id: 'iv1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('停用的 Webhook 不会推送', async () => {
    await saveWebhook({ event: '*', url: 'https://x.test/off', enabled: false })
    await emit('voucher.saved', {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('testWebhook 返回状态码', async () => {
    const status = await testWebhook({ id: 'w', event: '*', url: 'https://x.test/t', enabled: true, createdAt: 1 })
    expect(status).toBe(200)
  })
})
