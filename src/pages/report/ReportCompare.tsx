import { useEffect, useMemo, useState } from 'react'
import { Card, Segmented, Table, Tag, Space, Empty } from 'antd'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { ColumnsType } from 'antd/es/table'
import { getAvailablePeriods, getComparison, type CompareRow } from '@/services/statementService'
import { formatMoney } from '@/utils/format'

type Metric = 'netProfit' | 'revenue' | 'asset'

const METRIC_LABEL: Record<Metric, string> = {
  netProfit: '净利润（累计）',
  revenue: '营业收入（累计）',
  asset: '资产总额',
}

const money = (v?: number) => (v === undefined ? '--' : `¥${formatMoney(v)}`)

function deltaTag(v?: number) {
  if (v === undefined) return <span className="text-ink-400">--</span>
  const up = v >= 0
  return (
    <Tag color={up ? 'success' : 'error'} className="tabular-nums">
      {up ? '▲' : '▼'} {money(Math.abs(v)).replace('¥', '¥')}
    </Tag>
  )
}

export function ReportCompare() {
  const [periods, setPeriods] = useState<string[]>([])
  const [rows, setRows] = useState<CompareRow[]>([])
  const [metric, setMetric] = useState<Metric>('netProfit')
  const [loading, setLoading] = useState(false)

  const load = async (ps: string[]) => {
    if (ps.length === 0) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      setRows(await getComparison(ps))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getAvailablePeriods().then((ps) => {
      setPeriods(ps)
      load(ps)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chartData = useMemo(() => rows.map((r) => ({ period: r.period, value: r[metric] })), [rows, metric])

  const columns: ColumnsType<CompareRow> = [
    { title: '会计期间', dataIndex: 'period', width: 120 },
    { title: METRIC_LABEL.netProfit, dataIndex: 'netProfit', align: 'right', render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '净利润环比', dataIndex: 'momNetProfit', width: 160, align: 'right', render: (v?: number) => deltaTag(v) },
    { title: '净利润同比', dataIndex: 'yoyNetProfit', width: 160, align: 'right', render: (v?: number) => deltaTag(v) },
    { title: '营业收入同比', dataIndex: 'yoyRevenue', width: 160, align: 'right', render: (v?: number) => deltaTag(v) },
    { title: '资产总额', dataIndex: 'asset', align: 'right', render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
  ]

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">报表对比分析</h2>
            <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
              跨期间趋势对比，自动计算环比（较上一期）与同比（较去年同期），辅助经营洞察。
            </p>
          </div>
          <Space wrap>
            <Segmented
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
              options={[
                { label: '净利润', value: 'netProfit' },
                { label: '营业收入', value: 'revenue' },
                { label: '资产总额', value: 'asset' },
              ]}
            />
          </Space>
        </div>
      </Card>

      <Card title={`${METRIC_LABEL[metric]}趋势`} className="shadow-card" loading={loading}>
        {chartData.length === 0 ? (
          <Empty description="暂无可用期间数据" />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            {metric === 'asset' ? (
              <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => formatMoney(v)} />
                <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} />
                <Legend />
                <Bar dataKey="value" name={METRIC_LABEL[metric]} fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => formatMoney(v)} />
                <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} />
                <Legend />
                <Line type="monotone" dataKey="value" name={METRIC_LABEL[metric]} stroke="#0E9F6E" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="指标对比明细" className="shadow-card">
        <Table<CompareRow>
          rowKey="period"
          size="small"
          dataSource={rows}
          columns={columns}
          pagination={false}
          loading={loading}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  )
}
