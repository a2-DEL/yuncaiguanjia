import { useEffect, useState } from 'react'
import {
  Card, Button, Switch, Table, Tag, Modal, Form, Select, Input, Typography, App as AntdApp, Space, Popconfirm, Alert,
} from 'antd'
import {
  ApiOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined, SendOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { db } from '@/db/database'
import { exportAllJson, exportEntityCsv, exportEntityJson, EXPORTABLE_ENTITIES, ENTITY_LABEL, type ExportableEntity } from '@/services/exportService'
import {
  listWebhooks, saveWebhook, updateWebhook, deleteWebhook, testWebhook, WEBHOOK_EVENTS,
} from '@/services/webhookService'
import type { Webhook } from '@/types/models'

const { Title, Paragraph, Text } = Typography
const EVENT_OPTIONS = [
  { value: '*', label: '全部事件 (*)' },
  ...WEBHOOK_EVENTS.map((e) => ({ value: e, label: e })),
]

export function IntegrationSettingsPage() {
  const { message } = AntdApp.useApp()
  const [apiOn, setApiOn] = useState(false)
  const [entity, setEntity] = useState<ExportableEntity>('vouchers')
  const [hooks, setHooks] = useState<Webhook[]>([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Webhook | null>(null)
  const [form] = Form.useForm()

  const loadHooks = () => listWebhooks().then(setHooks)
  useEffect(() => {
    db.settings.get('apiEnabled').then((r) => setApiOn((r?.value as unknown as boolean) === true))
    loadHooks()
  }, [])

  const toggleApi = async (on: boolean) => {
    setApiOn(on)
    await db.settings.put({ key: 'apiEnabled', value: on as unknown as string })
    if (on && import.meta.env.PROD && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/finance-api-sw.js', { type: 'module' })
        message.success('本地只读 API 已启用')
      } catch {
        message.error('Service Worker 注册失败，请检查构建产物')
      }
    } else if (on) {
      message.info('本地 API 仅在「生产构建」(npm run build / preview) 后生效')
    } else {
      const reg = await navigator.serviceWorker?.getRegistration('/finance-api-sw.js')
      if (reg) await reg.unregister()
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const openModal = (h?: Webhook) => {
    setEditing(h ?? null)
    form.setFieldsValue(h ?? { event: 'voucher.saved', url: '', secret: '', enabled: true })
    setModal(true)
  }

  const submit = async () => {
    const v = await form.validateFields()
    if (editing) {
      await updateWebhook(editing.id, v)
      message.success('已更新 Webhook')
    } else {
      await saveWebhook(v)
      message.success('已新增 Webhook')
    }
    setModal(false)
    loadHooks()
  }

  const onTest = async (h: Webhook) => {
    const status = await testWebhook(h)
    if (status === 0) message.error('推送失败（网络错误或超时）')
    else message.success(`收到响应：HTTP ${status}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <Title level={2} className="!mb-1 !text-[22px] !font-semibold">开放互通</Title>
        <Paragraph className="!mb-0 !text-[13px] text-ink-500 dark:text-white/50">
          通过数据导出、本地只读 REST API 与 Webhook 三种方式，将系统数据安全地对外暴露，便于与第三方系统、报表工具或自有后端对接。所有数据均不出本地。
        </Paragraph>
      </div>

      {/* 区块一：数据导出 */}
      <Card className="shadow-card" title={<Space><DownloadOutlined /><span>数据导出</span></Space>}>
        <Paragraph className="!text-[13px] text-ink-500 dark:text-white/50">
          一键导出全部业务数据为结构化 JSON（外部 ETL 可直接接入），或按实体导出 CSV。
        </Paragraph>
        <Space wrap>
          <Button type="primary" icon={<DownloadOutlined />} onClick={async () => {
            const n = await exportAllJson()
            message.success(`已导出全量数据（${n} 条记录）`)
          }}>导出全量 JSON</Button>
          <Select value={entity} style={{ width: 180 }} onChange={setEntity}
            options={EXPORTABLE_ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))} />
          <Button icon={<FileTextOutlined />} onClick={async () => { await exportEntityCsv(entity); message.success('CSV 已导出') }}>导出 CSV</Button>
          <Button onClick={async () => { await exportEntityJson(entity); message.success('JSON 已导出') }}>导出 JSON</Button>
        </Space>
      </Card>

      {/* 区块二：本地只读 API */}
      <Card className="shadow-card" title={<Space><ApiOutlined /><span>本地只读 REST API</span></Space>}>
        <div className="flex items-center justify-between">
          <div>
            <Text strong>启用本地只读 API</Text>
            <div className="text-[12px] text-ink-500 dark:text-white/50">通过 Service Worker 拦截同源 /api/v1/*，实时读取本地数据，仅支持 GET。</div>
          </div>
          <Switch checked={apiOn} onChange={toggleApi} />
        </div>
        {apiOn ? (
          <Alert className="mt-3" type="success" showIcon
            message="本地只读 API 已启用"
            description={
              <div className="text-[12px]">
                <div>基础地址：<Text code>{baseUrl}/api/v1</Text></div>
                <div className="mt-1">示例：<Text code>GET {baseUrl}/api/v1/vouchers?limit=10&offset=0</Text></div>
                <div className="mt-1">支持实体：accounts / vouchers / contacts / invoices / assets / budgets / exchange-rates / entities / logs 等；单条 <Text code>GET /api/v1/vouchers/&lt;id&gt;</Text>；<Text code>GET /api/v1/health</Text> 健康检查。</div>
              </div>
            } />
        ) : (
          <Alert className="mt-3" type="info" showIcon message="未启用"
            description="开启后将在生产构建中注册 Service Worker，外部调用方（同源脚本/自动化）即可通过 HTTP 读取数据。" />
        )}
      </Card>

      {/* 区块三：Webhook */}
      <Card className="shadow-card" title={<Space><SendOutlined /><span>Webhook 出站通知</span></Space>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新增回调</Button>}>
        <Table
          rowKey="id" dataSource={hooks} pagination={false} locale={{ emptyText: '暂无 Webhook 配置' }}
          columns={[
            { title: '监听事件', dataIndex: 'event', render: (e: string) => <Tag color="blue">{e}</Tag> },
            { title: '回调地址', dataIndex: 'url', ellipsis: true },
            { title: '签名', render: (_: unknown, h: Webhook) => h.secret ? <Tag color="green">HMAC 已启用</Tag> : <Tag>无</Tag> },
            { title: '启用', dataIndex: 'enabled', render: (en: boolean) => <Tag color={en ? 'success' : 'default'}>{en ? '启用' : '停用'}</Tag> },
            {
              title: '操作', width: 200,
              render: (_: unknown, h: Webhook) => (
                <Space>
                  <Button size="small" icon={<SendOutlined />} onClick={() => onTest(h)}>测试</Button>
                  <Button size="small" onClick={() => openModal(h)}>编辑</Button>
                  <Popconfirm title="删除该回调？" onConfirm={async () => { await deleteWebhook(h.id); message.success('已删除'); loadHooks() }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]} />
      </Card>

      <Modal title={editing ? '编辑 Webhook' : '新增 Webhook'} open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="event" label="监听事件" rules={[{ required: true }]}>
            <Select options={EVENT_OPTIONS} />
          </Form.Item>
          <Form.Item name="url" label="回调地址 (URL)" rules={[{ required: true, type: 'url', message: '请输入合法的 http(s) 地址' }]}>
            <Input placeholder="https://example.com/webhook" />
          </Form.Item>
          <Form.Item name="secret" label="签名密钥 (可选)" extra="填写后将以 HMAC-SHA256 在请求头 X-Signature 签名，便于接收方验真。">
            <Input.Password placeholder="留空则不签名" />
          </Form.Item>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
