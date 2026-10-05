/**
 * 统一 AI 客户端：OpenAI 兼容 Chat Completions。
 *
 * 设计要点：
 * 1. 每个用户从 IndexedDB 读自己的 AiConfig（apiKey 本机隔离，不共用、不串号）。
 * 2. 适配 5 家主流厂商：DeepSeek / 豆包 / 通义千问 / 智谱GLM / OpenAI（见 aiProviders.ts）。
 * 3. 超时 60s（AbortController），错误信息转成中文友好提示。
 * 4. 业务 Agent 只调用 chat()，不关心底层端点；要换模型只改配置页。
 */
import { db } from '@/db/database'
import { useUserStore } from '@/store/userStore'
import { getProviderPreset } from './aiProviders'
import type { AiConfig } from '@/types/models'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature?: number
  /** 要求模型返回 JSON（OpenAI 兼容 response_format） */
  json?: boolean
  /** 超时毫秒，默认 60s */
  timeoutMs?: number
}

export class AiNotConfiguredError extends Error {
  constructor(public reason: 'none' | 'disabled' | 'missing_key') {
    super(
      reason === 'none'
        ? '尚未配置 AI 模型'
        : reason === 'disabled'
          ? '当前用户的 AI 配置已停用'
          : 'API Key 为空，请先在「系统设置 → AI 助手」里填写',
    )
    this.name = 'AiNotConfiguredError'
  }
}

/** 取当前登录用户的 AI 配置；无登录用户时回退到默认 user u1（与本系统演示模式一致） */
export async function getCurrentAiConfig(): Promise<AiConfig | undefined> {
  const uid = useUserStore.getState().currentUser?.id ?? 'u1'
  return db.aiConfigs.get(`ai_${uid}`)
}

/** 直接取指定用户的配置（供管理/测试用） */
export async function getAiConfigByUser(userId: string): Promise<AiConfig | undefined> {
  return db.aiConfigs.get(`ai_${userId}`)
}

/** 保存（upsert）当前用户的配置 */
export async function saveAiConfig(patch: Omit<AiConfig, 'id' | 'userId' | 'updatedAt'> & { id?: string; userId?: string }): Promise<AiConfig> {
  const userId = patch.userId ?? useUserStore.getState().currentUser?.id ?? 'u1'
  const id = `ai_${userId}`
  const existing = await db.aiConfigs.get(id)
  const row: AiConfig = {
    id,
    userId,
    provider: patch.provider ?? existing?.provider ?? 'deepseek',
    baseUrl: patch.baseUrl ?? existing?.baseUrl ?? '',
    apiKey: patch.apiKey ?? existing?.apiKey ?? '',
    model: patch.model ?? existing?.model ?? '',
    enabled: patch.enabled ?? existing?.enabled ?? true,
    updatedAt: Date.now(),
  }
  await db.aiConfigs.put(row)
  return row
}

function assertReady(cfg: AiConfig | undefined): asserts cfg is AiConfig {
  if (!cfg) throw new AiNotConfiguredError('none')
  if (!cfg.enabled) throw new AiNotConfiguredError('disabled')
  if (!cfg.apiKey.trim()) throw new AiNotConfiguredError('missing_key')
}

/** 把 OpenAI 错误响应体读成中文提示 */
async function readError(res: Response): Promise<string> {
  let body = ''
  try {
    body = await res.text()
    // OpenAI 风格：{"error":{"message":"..."}}
    const j = JSON.parse(body)
    body = j?.error?.message ?? j?.message ?? body
  } catch {
    /* 保留原文 */
  }
  if (res.status === 401) return `认证失败(401)：API Key 无效或已过期。${body}`
  if (res.status === 402 || res.status === 429) return `额度或限流问题(${res.status})：${body}`
  if (res.status === 404) return `接口地址不存在(404)：请检查 baseUrl 与模型名。${body}`
  if (res.status === 0) return `网络错误：可能是跨域(CORS)拦截或无法连通目标服务器。${body}`
  return `HTTP ${res.status}：${body}`
}

/**
 * 主入口：与模型多轮对话，返回 assistant 文本。
 * 抛 AiNotConfiguredError 或带中文信息的 Error。
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const cfg = await getCurrentAiConfig()
  assertReady(cfg)

  const base = (cfg.baseUrl || getProviderPreset(cfg.provider).defaultBaseUrl).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const timeoutMs = opts.timeoutMs ?? 60_000

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') throw new Error(`请求超时（>${timeoutMs / 1000}s）`)
    // fetch 失败（含 CORS）浏览器只抛 TypeError
    throw new Error(`无法连接模型服务。若为浏览器直连，多半是 CORS 跨域拦截——请在配置页把 baseUrl 改成你自己的 OpenAI 兼容反代。原始错误：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new Error(await readError(res))
  const data = await res.json()
  const text: string | undefined = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('模型返回为空：' + JSON.stringify(data).slice(0, 200))
  return text
}

/** 从模型输出中提取 JSON 对象/数组（容错：包裹在 ```json 里也能剥出来） */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1]! : text
  // 找第一个 { 或 [ 到最后一个 } 或 ]
  const start = raw.search(/[{[]/)
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  if (start < 0 || end <= start) throw new Error('模型输出中未找到 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

/** 测试连接：发一句极短的话，返回耗时与回复预览 */
export async function testConnection(cfg: AiConfig): Promise<{ ok: true; ms: number; reply: string } | { ok: false; error: string }> {
  const base = (cfg.baseUrl || getProviderPreset(cfg.provider).defaultBaseUrl).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping，只回两个字：在的' }],
        max_tokens: 16,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false, error: await readError(res) }
    const data = await res.json()
    const reply: string = data?.choices?.[0]?.message?.content?.trim() ?? '(空响应)'
    return { ok: true, ms: Date.now() - t0, reply }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
