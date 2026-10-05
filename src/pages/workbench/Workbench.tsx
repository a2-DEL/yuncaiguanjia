import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, List, Tag, Button, Segmented, App as AntdApp, Empty, Badge, Space } from 'antd'
import { CheckOutlined, CloseOutlined, RobotOutlined, InboxOutlined } from '@ant-design/icons'
import { listPendingProposals, approveProposal, rejectProposal } from '@/services/agents/proposalService'
import { AGENT_ROLES, getAgentRole } from '@/services/agents/registry'
import type { AgentProposal, AgentRoleKey } from '@/types/models'

const KIND_LABEL: Record<string, string> = {
  plain_entry: '说一句就记账',
  audit_finding: '凭证问题',
  risk_alert: '经营风险',
  cash_runway: '现金跑道',
  tax_threshold: '税务临界点',
  audit_queue: '待审凭证',
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'blue',
}

export function WorkbenchPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AgentProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const { message } = AntdApp.useApp()

  async function reload() {
    setLoading(true)
    const list = await listPendingProposals()
    setItems(list)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    if (roleFilter === 'all') return items
    return items.filter((p) => p.role === roleFilter)
  }, [items, roleFilter])

  async function onApprove(p: AgentProposal) {
    const r = await approveProposal(p.id)
    message.success(r.voucherNo ? `已批准，生成凭证 ${r.voucherNo}` : '已批准')
    if (r.voucherId) navigate(`/voucher/edit/${r.voucherId}`)
    else reload()
  }
  async function onReject(p: AgentProposal) {
    await rejectProposal(p.id)
    message.info('已驳回')
    reload()
  }

  const roleOptions = [
    { label: `全部 (${items.length})`, value: 'all' },
    ...AGENT_ROLES.map((r) => ({
      label: `${r.title} (${items.filter((p) => p.role === r.key).length})`,
      value: r.key,
    })),
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>财务工作台</h1>
          <p style={{ color: '#8a8f99', marginTop: 4 }}>
            数字员工提交的待批事项，你批了才真正入账。这是 AI 和人之间的闸门。
          </p>
        </div>
        <Badge count={items.length} overflowCount={99} style={{ backgroundColor: '#CF1322' }} />
      </div>

      <Segmented
        options={roleOptions}
        value={roleFilter}
        onChange={(v) => setRoleFilter(v as string)}
      />

      <Card size="small">
        {filtered.length === 0 ? (
          <Empty
            image={<InboxOutlined style={{ fontSize: 48, color: '#ddd' }} />}
            description="当前没有待批事项。可以点老板驾驶舱的「周度体检」让 AI 团队跑一遍。"
          />
        ) : (
          <List
            loading={loading}
            dataSource={filtered}
            renderItem={(p) => {
              const role = getAgentRole(p.role as AgentRoleKey)
              return (
                <List.Item
                  actions={[
                    <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => onApprove(p)}>
                      批准
                    </Button>,
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => onReject(p)}>
                      驳回
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<RobotOutlined style={{ fontSize: 22, color: '#1B5FE3' }} />}
                    title={
                      <Space size={6} wrap>
                        <Tag color="blue">{role.title}</Tag>
                        <Tag>{KIND_LABEL[p.kind] ?? p.kind}</Tag>
                        {p.confidence >= 0.9 && <Tag color="green">高置信</Tag>}
                      </Space>
                    }
                    description={
                      <div>
                        <div style={{ fontWeight: 600, marginTop: 4 }}>{p.title}</div>
                        <div style={{ color: '#8a8f99', fontSize: 12, marginTop: 4 }}>{p.detail}</div>
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <div style={{ fontSize: 12, color: '#bbb' }}>
        批准后：「说一句就记账」类会自动生成凭证草稿（仍需你去凭证页复核审核）；其他类只是标记已处理。所有操作写入哈希链日志。
      </div>
    </div>
  )
}
