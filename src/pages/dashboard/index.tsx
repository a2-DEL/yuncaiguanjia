import { useEffect, useState, useMemo } from 'react'
import { Card, Col, Row, Select, Button, List, Tag, App as AntdApp, Space, Table, Progress, Empty } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  RiseOutlined, FallOutlined, DollarOutlined, AccountBookOutlined, BankOutlined,
  FileProtectOutlined, AuditOutlined, PlusOutlined, BankOutlined as BankIcon,
  FundOutlined, BarChartOutlined, WarningOutlined, SwapOutlined, FileDoneOutlined, ToolOutlined, PieChartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StatCard } from '@/components/StatCard'
import { TrendLine } from '@/components/charts/TrendLine'
import { RatioPie } from '@/components/charts/RatioPie'
import { ContactBar } from '@/components/charts/ContactBar'
import { FundFlow } from '@/components/charts/FundFlow'
import {
  getDashboard, getRevenueExpenseTrend, getExpensePie, getContactBar, getFundFlow,
  type DashboardSummary, type TrendPoint, type PiePoint, type ContactPoint, type FundPoint,
} from '@/services/reportService'
import { getBudgetComparison, type BudgetRow } from '@/services/budgetService'
import { currentPeriod, formatMoney } from '@/utils/format'

export function DashboardPage() {
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const [period, setPeriod] = useState(currentPeriod())
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [pie, setPie] = useState<PiePoint[]>([])
  const [contact, setContact] = useState<ContactPoint[]>([])
  const [fund, setFund] = useState<FundPoint[]>([])
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([])

  useEffect(() => {
    getDashboard(period).then(setSummary)
    getExpensePie(period).then(setPie)
  }, [period])

  useEffect(() => {
    getBudgetComparison({ periodType: 'month', period, year: Number(period.split('-')[0]) }).then(setBudgetRows).catch(() => setBudgetRows([]))
  }, [period])

  useEffect(() => {
    getRevenueExpenseTrend().then(setTrend)
    getContactBar().then(setContact)
    getFundFlow().then(setFund)
  }, [])

  const quickActions = [
    { label: '新增凭证', icon: <PlusOutlined />, color: '#1B5FE3', onClick: () => navigate('/voucher/edit') },
    { label: '出纳记账', icon: <BankIcon />, color: '#0E9F6E', onClick: () => navigate('/cash') },
    { label: '往来账款', icon: <SwapOutlined />, color: '#FAAD14', onClick: () => navigate('/contact') },
    { label: '费用报销', icon: <FileDoneOutlined />, color: '#5B5BD6', onClick: () => navigate('/expense') },
    { label: '固定资产', icon: <FundOutlined />, color: '#0EA5E9', onClick: () => navigate('/asset') },
    { label: '税务管理', icon: <ToolOutlined />, color: '#D97706', onClick: () => navigate('/tax') },
    { label: '报表中心', icon: <AuditOutlined />, color: '#1B5FE3', onClick: () => navigate('/report') },
    { label: '预算分析', icon: <PieChartOutlined />, color: '#D97706', onClick: () => navigate('/budget') },
  ]

  const budgetSummary = useMemo(() => {
    const totalBudget = budgetRows.reduce((s, r) => s + r.amount, 0)
    const totalActual = budgetRows.reduce((s, r) => s + Math.max(0, r.actual), 0)
    const overCount = budgetRows.filter((r) => r.status === 'over').length
    return { totalBudget, totalActual, overCount }
  }, [budgetRows])

  const budgetColumns: ColumnsType<BudgetRow> = [
    { title: '科目', dataIndex: 'accountName', render: (_, r) => `${r.accountCode} ${r.accountName}` },
    { title: '预算额', dataIndex: 'amount', align: 'right', render: (v: number) => <span className="tabular-nums">{formatMoney(v)}</span> },
    { title: '实际', dataIndex: 'actual', align: 'right', render: (v: number) => <span className="tabular-nums">{formatMoney(v)}</span> },
    {
      title: '执行率', dataIndex: 'rate', width: 160,
      render: (rate: number, r) => (
        <Progress percent={Math.min(100, Math.round(rate * 100))} size="small"
          strokeColor={r.status === 'over' ? '#FF4D4F' : rate > 0.8 ? '#FAAD14' : '#52C41A'} />
      ),
    },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => {
        const m = { normal: ['green', '正常'], over: ['red', '超支'], none: ['default', '未执行'] } as const
        return <Tag color={m[s as keyof typeof m][0]}>{m[s as keyof typeof m][1]}</Tag>
      },
    },
  ]

  const todos = [
    { icon: <AuditOutlined className="text-[#FAAD14]" />, text: `待审核凭证 ${summary?.pendingCount ?? 0} 张`, tag: '待办' },
    { icon: <FileProtectOutlined className="text-[#1B5FE3]" />, text: `草稿凭证 ${summary?.draftCount ?? 0} 张`, tag: '待补全' },
    { icon: <WarningOutlined className="text-[#FF4D4F]" />, text: '当前账期尚未结账', tag: '提醒' },
    { icon: <BankOutlined className="text-[#0E9F6E]" />, text: `应收账款 ¥${(summary?.receivable ?? 0).toLocaleString()} 待回收`, tag: '往来' },
    ...(budgetSummary.overCount > 0
      ? [{ icon: <WarningOutlined className="text-[#FF4D4F]" />, text: `${budgetSummary.overCount} 个科目预算超支`, tag: '预警' }]
      : []),
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">数据驾驶舱</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            企业财务核心指标实时汇总，所有数据基于凭证自动计算，无需手工核算。
          </p>
        </div>
        <Select
          value={period}
          style={{ width: 150 }}
          onChange={setPeriod}
          options={[currentPeriod(), '2026-09', '2026-08', '2026-07'].map((p) => ({ value: p, label: p }))}
        />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><StatCard title="本月营收" value={summary?.revenue ?? 0} icon={<RiseOutlined />} color="#1B5FE3" /></Col>
        <Col xs={12} md={6}><StatCard title="本月支出" value={summary?.expense ?? 0} icon={<FallOutlined />} color="#FF4D4F" /></Col>
        <Col xs={12} md={6}><StatCard title="本月利润" value={summary?.profit ?? 0} icon={<DollarOutlined />} color="#52C41A" /></Col>
        <Col xs={12} md={6}><StatCard title="账户余额" value={summary?.accountBalance ?? 0} icon={<BankOutlined />} color="#0E9F6E" /></Col>
        <Col xs={12} md={6}><StatCard title="应收账款" value={summary?.receivable ?? 0} icon={<AccountBookOutlined />} color="#5B5BD6" /></Col>
        <Col xs={12} md={6}><StatCard title="应付账款" value={summary?.payable ?? 0} icon={<AccountBookOutlined />} color="#FAAD14" /></Col>
        <Col xs={12} md={6}><StatCard title="未审核凭证" value={summary?.unauditedCount ?? 0} prefix="" suffix=" 张" icon={<AuditOutlined />} color="#1B5FE3" /></Col>
        <Col xs={12} md={6}><StatCard title="凭证总数" value={summary?.voucherCount ?? 0} prefix="" suffix=" 张" icon={<FileProtectOutlined />} color="#0E9F6E" /></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="收支趋势" className="shadow-card" extra={<Tag color="blue">近 6 月</Tag>}>
            <TrendLine data={trend} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={`${period} 支出占比`} className="shadow-card">
            <RatioPie data={pie} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="往来账（应收 / 应付发生）" className="shadow-card" extra={<Tag color="green">近 6 月</Tag>}>
            <ContactBar data={contact} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="资金流水走势" className="shadow-card">
            <FundFlow data={fund} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card
            title="预算执行概览"
            className="shadow-card"
            extra={<Button type="link" onClick={() => navigate('/budget')}>编制与详情</Button>}
          >
            {budgetRows.length === 0 ? (
              <Empty description="本期未编制预算" />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-6">
                  <div>
                    <div className="text-[12px] text-ink-500 dark:text-white/50">预算总额</div>
                    <div className="text-[18px] font-semibold tabular-nums">¥{formatMoney(budgetSummary.totalBudget)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-ink-500 dark:text-white/50">实际总额</div>
                    <div className="text-[18px] font-semibold tabular-nums">¥{formatMoney(budgetSummary.totalActual)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-ink-500 dark:text-white/50">超支科目</div>
                    <div className="text-[18px] font-semibold tabular-nums" style={{ color: budgetSummary.overCount ? '#FF4D4F' : '#52C41A' }}>
                      {budgetSummary.overCount} 个
                    </div>
                  </div>
                </div>
                <Table size="small" pagination={false} rowKey="id" dataSource={budgetRows} columns={budgetColumns} />
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="快捷操作入口" className="shadow-card">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className="group flex flex-col items-center gap-2 rounded-2xl border border-black/[0.05] bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover dark:border-white/10 dark:bg-[#16181d]"
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-[22px] text-white transition-transform group-hover:scale-110"
                    style={{ background: a.color }}
                  >
                    {a.icon}
                  </span>
                  <span className="text-[14px] font-medium text-ink-900 dark:text-white">{a.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="待办与智能提醒" className="shadow-card">
            <List
              dataSource={todos}
              renderItem={(item) => (
                <List.Item>
                  <Space align="start">
                    <span className="mt-0.5 text-[18px]">{item.icon}</span>
                    <span className="text-[14px] text-ink-900 dark:text-white/85">{item.text}</span>
                  </Space>
                  <Tag>{item.tag}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
