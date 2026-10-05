import { useEffect, useState } from 'react'
import { Card, Col, Row, Spin, Tag, Empty, Button, App as AntdApp, Badge, List, Input } from 'antd'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import {
  WalletOutlined, WarningOutlined, RiseOutlined, FallOutlined, ThunderboltOutlined,
  CustomerServiceOutlined, RobotOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getBossCockpit, type BossCockpit } from '@/services/bossCockpit'
import { getBossInsight, type BossInsight } from '@/services/agents/watcherAgent'
import { listPendingProposals, approveProposal, rejectProposal } from '@/services/agents/proposalService'
import { runWeeklyHealthCheck, maybeAutoRunHealthCheck } from '@/services/agents/orchestrator'
import { askBoss } from '@/services/agents/bossQaAgent'
import { runWhatIf, WHAT_IF_PRESETS, type WhatIfScenario } from '@/services/agents/whatIfService'
import { getAgentRole } from '@/services/agents/registry'
import { formatMoney } from '@/utils/format'
import type { AgentProposal } from '@/types/models'

function BigNumber({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'red' | 'green' }) {
  const colorMap = { blue: '#1B5FE3', red: '#CF1322', green: '#389E0D' }
  return (
    <Card size="small" styles={{ body: { padding: 18 } }}>
      <div style={{ fontSize: 13, color: '#8a8f99' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: colorMap[tone] }} className="tabular-nums">
        ¥{formatMoney(value)}
      </div>
    </Card>
  )
}

export function BossCockpitPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<BossCockpit | null>(null)
  const [insight, setInsight] = useState<BossInsight | null>(null)
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [insightLoading, setInsightLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [qaInput, setQaInput] = useState('')
  const [qaAnswer, setQaAnswer] = useState<string | null>(null)
  const [qaLoading, setQaLoading] = useState(false)
  const [whatIf, setWhatIf] = useState<WhatIfScenario | null>(null)
  const { message } = AntdApp.useApp()

  async function reload() {
    setLoading(true)
    const [c, p] = await Promise.all([getBossCockpit(), listPendingProposals()])
    setData(c)
    setProposals(p)
    setLoading(false)
    // 自动出一句参谋建议（没配 Key 自动降级规则版）
    setInsightLoading(true)
    getBossInsight(c).then(setInsight).finally(() => setInsightLoading(false))
  }

  useEffect(() => {
    reload()
    // 距上次体检超 7 天自动跑一次（不阻塞页面）
    maybeAutoRunHealthCheck().then((r) => {
      if (r.ran && r.findings && r.findings > 0) {
        message.info(`AI 团队已自动完成周度体检，新发现 ${r.findings} 条待批事项`)
        reload()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onApprove(id: string) {
    const r = await approveProposal(id)
    if (r.voucherNo) {
      message.success(`已批准，生成凭证 ${r.voucherNo}，点确定去复核`)
      if (r.voucherId) navigate(`/voucher/edit/${r.voucherId}`)
    } else {
      message.success('已批准')
    }
    reload()
  }
  async function onReject(id: string) {
    await rejectProposal(id)
    message.info('已驳回')
    reload()
  }

  async function onRunCheck() {
    setChecking(true)
    try {
      const r = await runWeeklyHealthCheck()
      message.success(`体检完成：新发现 ${r.findings} 条待批事项`)
      reload()
    } catch {
      message.error('体检过程中出错')
    } finally {
      setChecking(false)
    }
  }

  async function onAsk() {
    if (!data || !qaInput.trim()) return
    setQaLoading(true)
    try {
      const r = await askBoss(qaInput.trim(), data)
      setQaAnswer(r.text)
    } finally {
      setQaLoading(false)
    }
  }

  function onExportPdf() {
    if (!data) return
    const w = window.open('', '_blank')
    if (!w) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>月度经营简报</title>
<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#222}
h1{font-size:22px;border-bottom:2px solid #1B5FE3;padding-bottom:8px}
.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee}
.label{color:#888}.val{font-weight:700;font-size:18px}
.alerts{background:#fffbe6;padding:12px;border-radius:8px;margin:12px 0}
.good{color:#389E0D}.bad{color:#CF1322}</style></head><body>
<h1>月度经营简报</h1>
<p style="color:#888">${new Date().toLocaleDateString('zh-CN')} · 云财管家自动生成</p>
<div class="row"><span class="label">可动用资金</span><span class="val">¥${data.availableFunds.toLocaleString()}</span></div>
<div class="row"><span class="label">本月收入</span><span class="val">¥${data.thisMonthRevenue.toLocaleString()}</span></div>
<div class="row"><span class="label">本月支出</span><span class="val">¥${data.thisMonthExpense.toLocaleString()}</span></div>
<div class="row"><span class="label">本月利润</span><span class="val ${data.thisMonthProfit >= 0 ? 'good' : 'bad'}">¥${data.thisMonthProfit.toLocaleString()}</span></div>
<div class="row"><span class="label">毛利率</span><span class="val">${data.grossMargin}%</span></div>
<div class="row"><span class="label">现金跑道</span><span class="val">${data.cashRunwayDays} 天</span></div>
<h3>需要注意</h3>
${data.alerts.length === 0 ? '<p>无</p>' : data.alerts.map((a) => `<div class="alerts"><b>${a.title}</b><br><small>${a.detail}</small></div>`).join('')}
<h3>欠钱大户</h3>
${data.topDebtors.length === 0 ? '<p>无</p>' : data.topDebtors.map((d) => `<div class="row"><span>${d.name}</span><span class="val bad">¥${d.amount.toLocaleString()}</span></div>`).join('')}
<p style="color:#aaa;font-size:12px;margin-top:30px">本简报由云财管家 AI 财务团队自动生成，数据基于已审核凭证。</p>
<script>window.onload=()=>window.print()</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
  if (!data) return <Empty />

  const dangerZone = data.minBalanceIn30d < 0

  return (
    <div style={{ padding: '20px 24px' }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>老板驾驶舱</h1>
          <p style={{ color: '#8a8f99', marginTop: 4, fontSize: 13 }}>
            只看你关心的：钱在哪、会不会断、赚没赚、哪有问题
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<FilePdfOutlined />} onClick={onExportPdf}>导出简报</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={checking} onClick={onRunCheck}>
            周度体检
          </Button>
          <Tag color="blue" icon={<RobotOutlined />}>AI 经营参谋在线</Tag>
        </div>
      </div>

      {/* 顶部四个老板最关心的数 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <BigNumber label="可动用资金" value={data.availableFunds} tone="blue" />
        </Col>
        <Col xs={12} md={6}>
          <BigNumber
            label="本月利润"
            value={data.thisMonthProfit}
            tone={data.thisMonthProfit >= 0 ? 'green' : 'red'}
          />
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" styles={{ body: { padding: 18 } }}>
            <div style={{ fontSize: 13, color: '#8a8f99' }}>30 天现金最低点</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: dangerZone ? '#CF1322' : '#1B5FE3' }} className="tabular-nums">
              ¥{formatMoney(data.minBalanceIn30d)}
            </div>
            <div style={{ fontSize: 12, color: dangerZone ? '#CF1322' : '#52C41A', marginTop: 4 }}>
              {dangerZone ? '⚠️ 会断粮' : '安全'} · 跑道 {data.cashRunwayDays} 天
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" styles={{ body: { padding: 18 } }}>
            <div style={{ fontSize: 13, color: '#8a8f99' }}>本月毛利率</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: data.grossMargin >= 20 ? '#389E0D' : '#FAAD14' }} className="tabular-nums">
              {data.grossMargin}%
            </div>
            <div style={{ fontSize: 12, color: '#8a8f99', marginTop: 4 }}>
              收入 ¥{formatMoney(data.thisMonthRevenue)} · 支出 ¥{formatMoney(data.thisMonthExpense)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* AI 一句话诊断 */}
      <Card
        size="small"
        title={<span><ThunderboltOutlined style={{ color: '#FAAD14' }} /> 经营参谋</span>}
        extra={insight?.source === 'llm' ? <Tag color="geekblue">AI 生成</Tag> : <Tag>规则诊断</Tag>}
      >
        <Spin spinning={insightLoading}>
          <p style={{ fontSize: 16, margin: '8px 0' }}>{insight?.summary ?? '分析中…'}</p>
          {insight && insight.advice.length > 0 && (
            <ul style={{ marginBottom: 0, paddingLeft: 20, color: '#555' }}>
              {insight.advice.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </Spin>
      </Card>

      {/* 老板问答 */}
      <Card size="small" title={<span><CustomerServiceOutlined /> 直接问</span>}>
        <div className="flex gap-2">
          <Input
            value={qaInput}
            onChange={(e) => setQaInput(e.target.value)}
            placeholder="例如：这个月赚了多少？哪个客户欠最多？还能撑多久？"
            onPressEnter={onAsk}
          />
          <Button type="primary" loading={qaLoading} onClick={onAsk}>问</Button>
        </div>
        {qaAnswer && (
          <div style={{ marginTop: 12, padding: 12, background: '#f6f9ff', borderRadius: 8, fontSize: 14 }}>
            {qaAnswer}
          </div>
        )}
      </Card>

      {/* What-If 沙盘 */}
      <Card size="small" title={<span><ThunderboltOutlined style={{ color: '#722ED1' }} /> 经营沙盘</span>} extra={<Tag color="purple">模拟值</Tag>}>
        <div className="flex flex-wrap gap-2">
          {WHAT_IF_PRESETS.map((p) => (
            <Button key={p.key} onClick={() => data && setWhatIf(runWhatIf(data, p.key))}>
              {p.icon} {p.label}
            </Button>
          ))}
        </div>
        {whatIf && (
          <div style={{ marginTop: 12, padding: 16, background: '#f9f0ff', borderRadius: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{whatIf.label}：{whatIf.verdict}</div>
            <div style={{ fontSize: 13, color: '#555' }}>
              模拟后月利润 ¥{Math.round(whatIf.newProfit).toLocaleString()}
              {whatIf.profitDelta !== 0 && <>（{whatIf.profitDelta > 0 ? '+' : ''}¥{Math.round(whatIf.profitDelta).toLocaleString()}）</>}
              {' '}· 现金跑道 {whatIf.newRunwayDays} 天
            </div>
          </div>
        )}
      </Card>

      {/* 30 天现金流预测曲线 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<span><WalletOutlined /> 未来 30 天现金流预测</span>}
            extra={<Tag color="orange">含预测值</Tag>}
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.curve} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bossG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B5FE3" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#1B5FE3" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatMoney(v as number)} width={70} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <ReferenceLine y={0} stroke="#CF1322" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="balance" name="预计余额" stroke="#1B5FE3" strokeWidth={2} fill="url(#bossG)" />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: '#8a8f99', marginTop: 8 }}>
              未来 30 天预计回款 ¥{formatMoney(data.upcomingReceipts)} · 预计要付 ¥{formatMoney(data.upcomingPayments)}
            </div>
          </Card>
        </Col>

        {/* 风险预警 */}
        <Col xs={24} lg={10}>
          <Card size="small" title={<span><WarningOutlined style={{ color: '#CF1322' }} /> 需要你注意</span>}>
            {data.alerts.length === 0 ? (
              <Empty description="目前没有明显异常" />
            ) : (
              <List
                size="small"
                dataSource={data.alerts}
                renderItem={(a) => (
                  <List.Item>
                    <div>
                      <div style={{ fontWeight: 600, color: a.level === 'high' ? '#CF1322' : '#FAAD14' }}>
                        <Tag color={a.level === 'high' ? 'red' : 'orange'}>{a.level === 'high' ? '紧急' : '关注'}</Tag>
                        {a.title}
                      </div>
                      <div style={{ color: '#8a8f99', fontSize: 12, marginTop: 4 }}>{a.detail}</div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 欠款大户 + AI 待批 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card size="small" title={<span><CustomerServiceOutlined /> 欠钱大户 Top 5</span>}>
            {data.topDebtors.length === 0 ? (
              <Empty description="目前没有应收逾期" />
            ) : (
              <List
                size="small"
                dataSource={data.topDebtors}
                renderItem={(d) => (
                  <List.Item>
                    <span>{d.name}</span>
                    <span className="tabular-nums" style={{ color: '#CF1322', fontWeight: 600 }}>
                      ¥{formatMoney(d.amount)}
                    </span>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<Badge count={proposals.length} offset={[6, 0]}><span>数字员工待批</span></Badge>}
          >
            {proposals.length === 0 ? (
              <Empty description="AI 团队没有待你审批的建议" />
            ) : (
              <List
                size="small"
                dataSource={proposals}
                renderItem={(p) => (
                  <List.Item
                    actions={[
                      <Button type="link" size="small" onClick={() => onApprove(p.id)}>批准</Button>,
                      <Button type="link" size="small" danger onClick={() => onReject(p.id)}>驳回</Button>,
                    ]}
                  >
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
        </Col>
      </Row>

      <div style={{ fontSize: 12, color: '#bbb', marginTop: 12 }}>
        <RiseOutlined style={{ marginRight: 4 }} />
        数据基于已审核凭证实时聚合 · 现金流预测包含未来已知应收应付 · 所有 AI 建议需你批准才生效
      </div>
    </div>
  )
}
