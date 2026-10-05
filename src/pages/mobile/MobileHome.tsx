import { useEffect, useState } from 'react'
import { Input, Button, Tabs, Badge, List, Tag, App as AntdApp, Empty, Spin } from 'antd'
import { WalletOutlined, MessageOutlined, AuditOutlined } from '@ant-design/icons'
import { getBossCockpit, type BossCockpit } from '@/services/bossCockpit'
import { askBoss } from '@/services/agents/bossQaAgent'
import { listPendingProposals, approveProposal, rejectProposal } from '@/services/agents/proposalService'
import { useNavigate } from 'react-router-dom'
import { getAgentRole } from '@/services/agents/registry'
import { quickEntry } from '@/services/agents/quickEntryService'
import type { AgentProposal } from '@/types/models'

/**
 * 手机端极简驾驶舱：大字体、三个 Tab（看钱/问一句/批待办）。
 * 给小老板在手机上用的——不用开电脑。
 */
export function MobileHomePage() {
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const [data, setData] = useState<BossCockpit | null>(null)
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [qa, setQa] = useState('')
  const [answer, setAnswer] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickLoading, setQuickLoading] = useState(false)

  async function onQuickSubmit() {
    if (!quickText.trim()) return
    setQuickLoading(true)
    try {
      const r = await quickEntry(quickText.trim())
      message.success(`已记：${r.parsed.categoryName} ¥${r.parsed.amount}，等财务批`)
      setQuickText('')
      reload()
    } catch (e: any) {
      message.error(e.message ?? '没听懂')
    } finally {
      setQuickLoading(false)
    }
  }

  async function reload() {
    const [c, p] = await Promise.all([getBossCockpit(), listPendingProposals()])
    setData(c)
    setProposals(p)
  }
  useEffect(() => { reload() }, [])

  async function onAsk() {
    if (!data || !qa.trim()) return
    setQaLoading(true)
    try {
      const r = await askBoss(qa.trim(), data)
      setAnswer(r.text)
    } finally {
      setQaLoading(false)
    }
  }

  async function onApprove(p: AgentProposal) {
    const r = await approveProposal(p.id)
    message.success(r.voucherNo ? `已批准 ${r.voucherNo}` : '已批准')
    if (r.voucherId) navigate(`/voucher/edit/${r.voucherId}`)
    reload()
  }

  if (!data) return <div style={{ padding: 80, textAlign: 'center' }}><Spin /></div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, paddingBottom: 80 }}>
      <Tabs
        defaultActiveKey="money"
        items={[
          {
            key: 'money',
            label: <span><WalletOutlined /> 看钱</span>,
            children: (
              <div className="space-y-3">
                <div style={{ background: 'linear-gradient(135deg,#1B5FE3,#073AB5)', color: 'white', padding: 24, borderRadius: 16 }}>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>可动用资金</div>
                  <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>¥{data.availableFunds.toLocaleString()}</div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
                    本月利润 ¥{data.thisMonthProfit.toLocaleString()} · 跑道 {data.cashRunwayDays} 天
                  </div>
                </div>
                {data.alerts.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 10, background: a.level === 'high' ? '#fff2f0' : '#fffbe6', fontSize: 13 }}>
                    <b>{a.title}</b>
                    <div style={{ color: '#666', marginTop: 4 }}>{a.detail}</div>
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'ask',
            label: <span><MessageOutlined /> 问一句</span>,
            children: (
              <div className="space-y-3">
                <Input.TextArea rows={3} value={qa} onChange={(e) => setQa(e.target.value)} placeholder="这个月赚了多少？" />
                <Button type="primary" block loading={qaLoading} onClick={onAsk}>问</Button>
                {answer && <div style={{ padding: 16, background: '#f6f9ff', borderRadius: 10, fontSize: 15 }}>{answer}</div>}
              </div>
            ),
          },
          {
            key: 'quick',
            label: <span>+ 记一笔</span>,
            children: (
              <div className="space-y-3">
                <Input.TextArea rows={3} value={quickText} onChange={(e) => setQuickText(e.target.value)} placeholder="例如：打车86微信付 / 进货5000没付款" />
                <Button type="primary" block loading={quickLoading} onClick={onQuickSubmit}>提交</Button>
                <div style={{ fontSize: 12, color: '#999' }}>提交后财务在电脑上审批，批了才入账。</div>
              </div>
            ),
          },
          {
            key: 'approve',
            label: <Badge count={proposals.length} size="small"><span><AuditOutlined /> 批待办</span></Badge>,
            children: proposals.length === 0 ? (
              <Empty description="没有待办" />
            ) : (
              <List
                dataSource={proposals}
                renderItem={(p) => (
                  <List.Item
                    actions={[
                      <Button size="small" type="link" onClick={() => onApprove(p)}>批</Button>,
                      <Button size="small" type="link" danger onClick={() => { rejectProposal(p.id); reload() }}>驳</Button>,
                    ]}
                  >
                    <div>
                      <Tag color="blue">{getAgentRole(p.role).title}</Tag>
                      <b style={{ fontSize: 14 }}>{p.title}</b>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{p.detail}</div>
                    </div>
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
