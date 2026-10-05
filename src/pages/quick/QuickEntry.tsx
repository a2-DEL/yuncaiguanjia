import { useState } from 'react'
import { Card, Input, Button, App as AntdApp, Tag, Empty, List, Typography } from 'antd'
import { EditOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { quickEntry } from '@/services/agents/quickEntryService'
import { listPendingProposals } from '@/services/agents/proposalService'
import { getAgentRole } from '@/services/agents/registry'
import type { AgentProposal } from '@/types/models'

const { Text, Paragraph } = Typography

const EXAMPLES = [
  '昨天打车花了86，微信付的',
  '请客户吃饭花了320，刷的银行卡',
  '买了2箱打印纸，320，现金',
  '交了这个月房租4500，银行转账',
  '从鼎盛进货5000，未付款',
  '客户转了8000到银行卡',
  '卖给张三10箱货5000，他还没给',
]

export function QuickEntryPage() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<AgentProposal[]>([])
  const { message } = AntdApp.useApp()

  async function refreshPending() {
    const list = await listPendingProposals()
    setPending(list.filter((p) => p.kind === 'plain_entry'))
  }

  useState(() => { refreshPending() })

  async function submit() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const r = await quickEntry(text.trim())
      message.success(`已记下：${r.parsed.categoryName} ¥${r.parsed.amount}，等财务审批`)
      setText('')
      refreshPending()
    } catch (e: any) {
      message.error(e.message ?? '没听懂，换个说法试试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }} className="space-y-5">
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>说一句就记账</h1>
        <p style={{ color: '#8a8f99', marginTop: 6 }}>
          不用学科目、不用填表单，像发微信一样说一句花了多少、干嘛花的，财务那边会收到一条待审凭证。
        </p>
      </div>

      <Card size="small" className="shadow-card">
        <Input.TextArea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：昨天打车花了86，微信付的"
          autoFocus
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); submit() } }}
        />
        <div className="mt-3 flex items-center justify-between">
          <div style={{ fontSize: 12, color: '#aaa' }}>
            <EditOutlined />  Shift+Enter 换行 · Enter 提交
          </div>
          <Button type="primary" loading={loading} onClick={submit}>
            交给财务
          </Button>
        </div>
      </Card>

      <div>
        <div style={{ fontSize: 13, color: '#8a8f99', marginBottom: 8 }}>试试这些：</div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <Tag key={ex} style={{ cursor: 'pointer', padding: '4px 10px' }} onClick={() => setText(ex)}>
              {ex}
            </Tag>
          ))}
        </div>
      </div>

      <Card size="small" title={<span><CheckCircleOutlined /> 我刚提交的（等财务批）</span>}>
        {pending.length === 0 ? (
          <Empty description="还没提交过。上面说一句试试。" />
        ) : (
          <List
            size="small"
            dataSource={pending}
            renderItem={(p) => (
              <List.Item>
                <div>
                  <div>
                    <Tag color="blue">{getAgentRole(p.role).title}</Tag>
                    <b>{p.title}</b>
                  </div>
                  <div style={{ color: '#8a8f99', fontSize: 12, marginTop: 4 }}>{p.detail}</div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        <RobotOutlined />  本地规则能识别打车/吃饭/办公/房租/进货等常见场景，不花 API 费用；复杂语句会自动调 AI 理解。所有记录都要财务批了才真正入账。
      </Paragraph>
    </div>
  )
}
