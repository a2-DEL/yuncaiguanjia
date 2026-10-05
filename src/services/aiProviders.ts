/**
 * 主流大模型厂商预设。
 * 现状（2025）：DeepSeek / 豆包(火山方舟) / 通义千问(DashScope) / 智谱GLM / OpenAI
 * 均已提供 OpenAI 兼容的 /chat/completions 接口，鉴权头同为 `Authorization: Bearer <key>`。
 * 区别只在 baseUrl 与默认模型名，因此统一用一个 OpenAI 兼容客户端即可接入，无需为每家写 SDK。
 *
 * 注意：以下 baseUrl 与默认 model 为出厂默认值，用户可在「AI 助手配置」页自行修改；
 * 若浏览器直连遇到 CORS 限制，可把 baseUrl 改成自己部署的 OpenAI 兼容反代地址。
 */
import type { AiProviderKey } from '@/types/models'

export interface ProviderPreset {
  key: AiProviderKey
  label: string
  /** 官方 OpenAI 兼容端点（不以 / 结尾） */
  defaultBaseUrl: string
  /** 出厂默认模型，用户可改 */
  defaultModel: string
  /** 申请 Key 的地址（帮助用户跳转） */
  keyUrl: string
  /** 一句话说明 */
  hint: string
}

export const AI_PROVIDERS: ProviderPreset[] = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    hint: '国产高性价比模型，中文记账场景表现好、费用低。',
  },
  {
    key: 'doubao',
    label: '豆包（火山方舟）',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-4k',
    keyUrl: 'https://console.volcengine.com/ark',
    hint: '字节跳动火山方舟，model 通常填接入点 ID（ep-xxxx）。',
  },
  {
    key: 'qwen',
    label: '通义千问（阿里云）',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    hint: '阿里云 DashScope 兼容模式，支持 qwen-plus / qwen-turbo。',
  },
  {
    key: 'zhipu',
    label: '智谱 GLM',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    hint: '智谱 AI，glm-4-flash 免费额度较大，适合试用。',
  },
  {
    key: 'openai',
    label: 'OpenAI / GPT',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'GPT 系列；国内直连可能需自备网络或反代。',
  },
  {
    key: 'custom',
    label: '自定义（任意 OpenAI 兼容）',
    defaultBaseUrl: '',
    defaultModel: '',
    keyUrl: '',
    hint: '填你自己的反代 / 私有部署（如 OneAPI、FastGPT、vLLM、Ollama /v1）。',
  },
]

export function getProviderPreset(key: AiProviderKey): ProviderPreset {
  return AI_PROVIDERS.find((p) => p.key === key) ?? AI_PROVIDERS[AI_PROVIDERS.length - 1]
}
