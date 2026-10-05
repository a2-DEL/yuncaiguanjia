import { useEffect, useMemo, useState } from 'react'
import {
  Card, Select, Button, Space, Table, Tag, Modal, Form, InputNumber, Progress, message, Empty, Popconfirm, Statistic, Segmented,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PieChartOutlined, PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { usePermission } from '@/hooks/usePermission'
import { SubjectTreeSelect } from '@/components/SubjectTreeSelect'
import {
  getBudgetComparison, saveBudget, deleteBudget, type BudgetRow,
} from '@/services/budgetService'
import type { BudgetPeriodType } from '@/types/models'
import { getAccount } from '@/services/accountService'
import { currentPeriod, formatMoney } from '@/utils/format'

const periodLabel = (pt: BudgetPeriodType, period: string) =>
  pt === 'month' ? period : pt === 'quarter' ? `${period.replace('-', ' 第')} 季度` : `${period} 年度`

const money = (v: number) => <span className="tabular-nums">{formatMoney(v)}</span>

export function BudgetManagePage() {
  const { can } = usePermission()
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('month')
  const [selYear, setSelYear] = useState(dayjs().year())
  const [selMonth, setSelMonth] = useState(currentPeriod())
  const [selQuarter, setSelQuarter] = useState(Math.ceil((dayjs().month() + 1) / 3))
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<BudgetRow | null>(null)
  const [form] = Form.useForm()

  const current = useMemo(() => {
    if (periodType === 'month') return { periodType, period: selMonth, year: Number(selMonth.slice(0, 4)) }
    if (periodType === 'quarter') return { periodType, period: `${selYear}-Q${selQuarter}`, year: selYear }
    return { periodType, period: `${selYear}`, year: selYear }
  }, [periodType, selMonth, selQuarter, selYear])

  const load = async () => {
    setLoading(true)
    try {
      setRows(await getBudgetComparison(current))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [current.periodType, current.period, current.year])

  const openAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ amount: 0 })
    setModal(true)
  }
  const openEdit = (r: BudgetRow) => {
    setEditing(r)
    form.setFieldsValue({ accountCode: r.accountCode, amount: r.amount })
    setModal(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    const acc = await getAccount(v.accountCode)
    if (!acc) { message.error('科目无效'); return }
    const base = editing ? { periodType: editing.periodType, period: editing.period, year: editing.year } : current
    await saveBudget({ ...base, accountCode: v.accountCode, accountName: acc.name, amount: v.amount })
    message.success('已保存预算')
    setModal(false)
    load()
  }
  const remove = async (id: string) => { await deleteBudget(id); message.success('已删除'); load() }

  const summary = useMemo(() => {
    const totalBudget = rows.reduce((s, r) => s + r.amount, 0)
    const totalActual = rows.reduce((s, r) => s + Math.max(0, r.actual), 0)
    const overCount = rows.filter((r) => r.status === 'over').length
    return { totalBudget, totalActual, overCount }
  }, [rows])

  const momLabel = periodType === 'year' ? '较上年' : '环比上期'

  const columns: ColumnsType<BudgetRow> = [
    { title: '科目', dataIndex: 'accountName', render: (_, r) => `${r.accountCode} ${r.accountName}` },
    { title: '预算额', dataIndex: 'amount', align: 'right', render: (v: number) => money(v) },
    { title: '实际发生额', dataIndex: 'actual', align: 'right', render: (v: number) => money(v) },
    {
      title: '执行率', dataIndex: 'rate', width: 160,
      render: (rate: number, r) => (
        <Progress percent={Math.min(100, Math.round(rate * 100))} size="small"
          strokeColor={r.status === 'over' ? '#E5484D' : rate > 0.8 ? '#E5A000' : '#0E9F6E'} />
      ),
    },
    { title: '较上年同期', dataIndex: 'actualYoY', align: 'right', render: (v?: number) => (v == null ? '--' : money(v)) },
    { title: momLabel, dataIndex: 'actualMoM', align: 'right', render: (v?: number) => (v == null ? '--' : money(v)) },
    {
      title: '差异', dataIndex: 'variance', align: 'right',
      render: (v: number, r) => (
        <span className="tabular-nums" style={{ color: r.status === 'over' ? '#E5484D' : r.status === 'none' ? '#8a8f99' : '#0E9F6E' }}>
          {v >= 0 ? '' : '-'}{formatMoney(Math.abs(v))}
        </span>
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
  if (can('budget:manage')) {
    columns.push({
      title: '操作', key: 'op', width: 130,
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除该预算？" onConfirm={() => remove(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    })
  }

  const exportCsv = () => {
    const header = ['科目编码', '科目名称', '预算额', '实际发生额', '执行率', '较上年同期', momLabel, '差异', '状态']
    const lines = rows.map((r) => [
      r.accountCode, r.accountName, r.amount, r.actual, `${(r.rate * 100).toFixed(1)}%`,
      r.actualYoY ?? '', r.actualMoM ?? '', r.variance,
      r.status === 'over' ? '超支' : r.status === 'none' ? '未执行' : '正常',
    ])
    const csv = [header, ...lines].map((row) => row.map((c) => `"${c ?? ''}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `预算执行_${current.period}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 CSV')
  }

  const years = useMemo(() => {
    const y = dayjs().year()
    return Array.from({ length: 4 }, (_, i) => y - 2 + i)
  }, [])
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0')
      return { value: `${selYear}-${m}`, label: `${selYear}-${m}` }
    }),
    [selYear],
  )

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            <PieChartOutlined style={{ color: '#1B5FE3', marginRight: 8 }} />预算与分析
          </h2>
          <div style={{ color: '#8a8f99', fontSize: 13, marginTop: 4 }}>按科目编制预算，对比已审核凭证实际发生额（支持月 / 季 / 年维度与同环比）</div>
        </div>
        <Space wrap>
          <Segmented
            value={periodType}
            onChange={(v) => setPeriodType(v as BudgetPeriodType)}
            options={[{ label: '月度', value: 'month' }, { label: '季度', value: 'quarter' }, { label: '年度', value: 'year' }]}
          />
          <Select value={selYear} onChange={setSelYear} style={{ width: 110 }} options={years.map((y) => ({ value: y, label: `${y} 年` }))} />
          {periodType === 'month' && (
            <Select value={selMonth} onChange={setSelMonth} style={{ width: 130 }} options={monthOptions} />
          )}
          {periodType === 'quarter' && (
            <Select value={selQuarter} onChange={setSelQuarter} style={{ width: 110 }} options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))} />
          )}
          {can('budget:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增预算</Button>}
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>导出</Button>
        </Space>
      </div>

      <Space size={16} style={{ marginBottom: 16, width: '100%', display: 'flex' }}>
        <Card size="small" style={{ flex: 1 }}><Statistic title="预算总额" value={summary.totalBudget} precision={2} prefix="¥" /></Card>
        <Card size="small" style={{ flex: 1 }}><Statistic title="实际总额（发生额）" value={summary.totalActual} precision={2} prefix="¥" /></Card>
        <Card size="small" style={{ flex: 1 }}>
          <Statistic title="超支科目数" value={summary.overCount} suffix="个"
            valueStyle={{ color: summary.overCount ? '#E5484D' : '#0E9F6E' }} />
        </Card>
      </Space>

      <Card size="small" title={`预算执行明细（${periodLabel(periodType, current.period)}）`}>
        <Table bordered size="small" loading={loading} pagination={false} rowKey="id"
          dataSource={rows} columns={columns}
          locale={{ emptyText: <Empty description="本期暂无预算，点击右上角新增" /> }} />
      </Card>

      <Modal title={editing ? '编辑预算' : '新增预算'} open={modal} onCancel={() => setModal(false)} onOk={submit} okText="保存">
        <Form form={form} layout="vertical">
          <Form.Item name="accountCode" label="预算科目" rules={[{ required: true, message: '请选择科目' }]}>
            <SubjectTreeSelect placeholder="选择需管控的科目（通常为费用 / 损益类）" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="amount" label="预算金额" rules={[{ required: true, message: '请输入预算金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" placeholder="该维度允许的发生额" />
          </Form.Item>
          {!editing && (
            <div style={{ color: '#8a8f99', fontSize: 12 }}>将计入维度：{periodLabel(periodType, current.period)}</div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
