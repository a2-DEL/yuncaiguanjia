import { useEffect, useState } from 'react'
import { Card, Col, Row, Spin, Select, Typography } from 'antd'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  getDashboard, getRevenueExpenseTrend, getExpensePie, getContactBar, getFundFlow,
  type DashboardSummary, type TrendPoint, type PiePoint, type ContactPoint, type FundPoint,
} from '@/services/reportService'
import { currentPeriod, formatMoney } from '@/utils/format'

const { Title, Text } = Typography
const COLORS = ['#1B5FE3', '#073AB5', '#FAAD14', '#389E0D', '#CF1322', '#722ED1', '#13C2C2']

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <div style={{ color: '#8a8f99', fontSize: 13 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, marginTop: 4 }} className="tabular-nums">
        {formatMoney(value)}
      </div>
    </Card>
  )
}

export function CockpitPage() {
  const [period, setPeriod] = useState(currentPeriod())
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [pie, setPie] = useState<PiePoint[]>([])
  const [contact, setContact] = useState<ContactPoint[]>([])
  const [fund, setFund] = useState<FundPoint[]>([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getDashboard(period),
      getRevenueExpenseTrend(6),
      getExpensePie(period),
      getContactBar(6),
      getFundFlow(6),
    ]).then(([s, t, p, c, f]) => {
      setSummary(s); setTrend(t); setPie(p); setContact(c); setFund(f)
    }).finally(() => setLoading(false))
  }, [period])

  const profit = summary ? summary.profit : 0

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>经营驾驶舱</Title>
        <Select value={period} onChange={setPeriod} style={{ width: 160 }} options={[period].map((p) => ({ value: p, label: p }))} />
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="营业收入" value={summary?.revenue ?? 0} color="#1B5FE3" />
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="营业支出" value={summary?.expense ?? 0} color="#FAAD14" />
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="利润" value={profit} color={profit >= 0 ? '#389E0D' : '#CF1322'} />
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="资金余额" value={summary?.accountBalance ?? 0} color="#073AB5" />
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="应收" value={summary?.receivable ?? 0} color="#13C2C2" />
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Kpi label="应付" value={summary?.payable ?? 0} color="#722ED1" />
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <Card size="small" title="近 6 月收入/支出趋势">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => formatMoney(v as number)} width={70} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="收入" stroke="#1B5FE3" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" name="支出" stroke="#FAAD14" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="支出结构占比">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.name}>
                    {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="应收/应付（近 6 月）">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={contact} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => formatMoney(v as number)} width={70} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Bar dataKey="receivable" name="应收" fill="#13C2C2" />
                  <Bar dataKey="payable" name="应付" fill="#722ED1" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="资金滚动结余（近 6 月）">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={fund} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1B5FE3" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#1B5FE3" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => formatMoney(v as number)} width={70} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Area type="monotone" dataKey="balance" name="结余" stroke="#1B5FE3" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          数据基于已审核凭证实时聚合 · 经营驾驶舱
        </Text>
      </Spin>
    </div>
  )
}
