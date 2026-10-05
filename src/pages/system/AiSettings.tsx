import { useEffect, useState } from 'react'
import {
  Card, Form, Select, Input, Button, Switch, Typography, App as AntdApp, Space, Alert, Tag, Divider,
} from 'antd'
import { ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { AI_PROVIDERS, getProviderPreset } from '@/services/aiProviders'
import { getCurrentAiConfig, saveAiConfig, testConnection } from '@/services/aiClient'
import { useUserStore } from '@/store/userStore'
import type { AiConfig, AiProviderKey } from '@/types/models'

const { Title, Paragraph, Text } = Typography

/** 脱敏显示 API Key：只显前 4 后 4 */
function maskKey(k: string): string {
  if (!k) return '（未填写）'
  if (k.length <= 10) return k.slice(0, 2) + '****'
  return `${k.slice(0, 4)}****${k.slice(-4)}`
}

interface FormState {
  provider: AiProviderKey
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
}

export function AiSettingsPage() {
  const { message } = AntdApp.useApp()
  const currentUser = useUserStore((s) => s.currentUser)
  const [form, setForm] = useState<FormState>({
    provider: 'deepseek',
    baseUrl: '',
    model: '',
    apiKey: '',
    enabled: true,
  })
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    getCurrentAiConfig().then((cfg) => {
      if (cfg) {
        setForm({
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          apiKey: cfg.apiKey,
          enabled: cfg.enabled,
        })
      } else {
        // 首次进入：按默认 provider 带出预设
        const p = getProviderPreset('deepseek')
        setForm((f) => ({ ...f, baseUrl: p.defaultBaseUrl, model: p.defaultModel }))
      }
      setLoaded(true)
    })
  }, [])

  /** 切换厂商：自动回填该厂商的 baseUrl 与默认模型（用户仍可改） */
  const onProviderChange = (key: AiProviderKey) => {
    const p = getProviderPreset(key)
    setForm((f) => ({ ...f, provider: key, baseUrl: p.defaultBaseUrl, model: p.defaultModel }))
    setTestResult(null)
  }

  const preset = getProviderPreset(form.provider)

  const onSave = async () => {
    if (!form.apiKey.trim()) {
      message.warning('请填写 API Key')
      return
    }
    await saveAiConfig({
      provider: form.provider,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      apiKey: form.apiKey.trim(),
      enabled: form.enabled,
    })
    message.success('已保存你的 AI 配置')
  }

  const onTest = async () => {
    if (!form.apiKey.trim()) {
      message.warning('请先填写 API Key')
      return
    }
    setTesting(true)
    setTestResult(null)
    const cfg: AiConfig = {
      id: 'test',
      userId: currentUser?.id ?? 'u1',
      provider: form.provider,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      enabled: true,
      updatedAt: Date.now(),
    }
    const r = await testConnection(cfg)
    setTesting(false)
    if (r.ok) setTestResult({ ok: true, text: `连通成功，耗时 ${r.ms}ms，模型回复：${r.reply}` })
    else setTestResult({ ok: false, text: r.error })
  }

  if (!loaded) return null

  return (
    <div className="space-y-5">
      <div>
        <Title level={2} className="!mb-1 !text-[22px] !font-semibold">AI 助手配置</Title>
        <Paragraph className="!mb-0 !text-[13px] text-ink-500 dark:text-white/50">
          每个账号配置<b>自己的</b>大模型 API Key，互不共用、各付各的账单；支持 DeepSeek / 豆包 / 通义千问 / 智谱GLM / OpenAI 及任意 OpenAI 兼容端点。
        </Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="隐私与费用说明"
        description={
          <div className="text-[12px] leading-6">
            <div>· API Key 仅保存在你本机浏览器的 IndexedDB 中，不上传任何服务器；更换浏览器/清除站点数据后需重新填写。</div>
            <div>· 调用大模型产生的费用由你在对应厂商的账户中结算，系统不经手、不分润。</div>
            <div>· 浏览器直连第三方 API 可能遇到 CORS 跨域限制；若测试连接报网络错误，请把 baseUrl 改成你自己部署的 OpenAI 兼容反代。</div>
          </div>
        }
      />

      <Card className="shadow-card" title={<Space><ApiOutlined /><span>当前账号：{currentUser?.name ?? '未登录（演示 u1）'}</span></Space>}>
        <Form layout="vertical" className="max-w-2xl">
          <Form.Item label="模型厂商" required>
            <Select
              value={form.provider}
              onChange={onProviderChange}
              options={AI_PROVIDERS.map((p) => ({ value: p.key, label: p.label }))}
            />
            <Text type="secondary" className="text-[12px]">{preset.hint}</Text>
          </Form.Item>

          <Form.Item label="API Base URL" required extra={preset.keyUrl ? <>申请 Key：<a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.keyUrl}</a></> : undefined}>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
            />
          </Form.Item>

          <Form.Item label="模型名 (model)" required>
            <Input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder={preset.defaultModel || '例如 qwen-plus / glm-4-flash / ep-xxxx'}
            />
          </Form.Item>

          <Form.Item label="API Key" required>
            <Input.Password
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-..."
              autoComplete="off"
            />
            {form.apiKey && <Text type="secondary" className="text-[12px]">已保存：{maskKey(form.apiKey)}</Text>}
          </Form.Item>

          <Form.Item label="启用此配置" valuePropName="checked">
            <Switch checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          </Form.Item>

          <Divider />

          <Space>
            <Button type="primary" onClick={onSave}>保存配置</Button>
            <Button icon={<ThunderboltOutlined />} loading={testing} onClick={onTest}>测试连接</Button>
          </Space>

          {testResult && (
            <Alert
              className="mt-4"
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              message={testResult.ok ? '连接成功' : '连接失败'}
              description={<div className="text-[12px] break-all">{testResult.text}</div>}
            />
          )}
        </Form>
      </Card>

      <Card className="shadow-card" title={<Space><ThunderboltOutlined /><span>接入的 Agent 团队</span></Space>}>
        <div className="text-[13px] leading-7">
          <Tag color="blue">记账 Agent</Tag> 用一句话描述业务，自动生成借贷凭证草稿（<a href="/ai">前往使用 →</a>）<br />
          <Tag color="purple">审核 Agent</Tag> 批量复核凭证，找出科目错用、异常金额等风险点<br />
          <Tag color="cyan">录入 Agent</Tag> 口语描述自动抽取往来单位/报销/发票字段，少填表
        </div>
      </Card>
    </div>
  )
}
