import { useEffect, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp,
  Space, Popconfirm, DatePicker, Row, Col, Statistic,
} from 'antd'
import { PlusOutlined, CheckOutlined, CloseOutlined, PayCircleOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listExpenseClaims, createExpenseClaim, approveExpense, rejectExpense, payExpense, generateVoucherForClaim,
  EXPENSE_NODES,
} from '@/services/expenseService'
import { EXPENSE_STATUS_LABEL, type ExpenseClaim, type ExpenseStatus } from '@/types/models'
import { money, currentPeriod } from '@/utils/format'
import { usePermission } from '@/hooks/usePermission'

const STATUS_COLOR: Record<ExpenseStatus, string> = {
  draft: 'default', submitted: 'blue', approved: 'green', rejected: 'red', paid: 'purple',
}

export function ExpenseManagePage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stats, setStats] = useState<Record<string, { count: number; amount: number }>>({})

  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    const list = await listExpenseClaims(statusFilter === 'all' ? {} : { status: statusFilter as ExpenseStatus })
    setClaims(list)
    const all = await listExpenseClaims({})
    const s: Record<string, { count: number; amount: number }> = {}
    all.forEach((c) => {
      const cur = s[c.status] || { count: 0, amount: 0 }
      cur.count += 1; cur.amount += c.total; s[c.status] = cur
    })
    setStats(s)
  }
  useEffect(() => { load() }, [statusFilter])

  const openModal = () => {
    form.setFieldsValue({ date: dayjs(), items: [{ category: '差旅费', summary: '', amount: 0 }] })
    setModal(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    const items = v.items.map((it: any) => ({ category: it.category, summary: it.summary, amount: it.amount, accountCode: it.accountCode }))
    await createExpenseClaim({ applicant: v.applicant, department: v.department, date: (v.date as Dayjs).format('YYYY-MM-DD'), items, remark: v.remark })
    message.success('报销单已提交'); setModal(false); load()
  }

  const doApprove = async (id: string) => { await approveExpense(id); message.success('已审核'); load() }
  const doReject = async (id: string) => { await rejectExpense(id); message.success('已驳回'); load() }
  const doPay = async (id: string) => { await payExpense(id); message.success('已支付并生成凭证'); load() }
  const doVoucher = async (id: string) => { const no = await generateVoucherForClaim(id); message.success(`已生成凭证 ${no}`); load() }

  const columns = [
    { title: '报销单号', dataIndex: 'claimNo', width: 150 },
    { title: '申请人', dataIndex: 'applicant', render: (t: string) => <span className="font-medium">{t}</span> },
    { title: '部门', dataIndex: 'department' },
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '金额', dataIndex: 'total', align: 'right' as const, render: (v: number) => <span className="tabular-nums font-medium">{money(v)}</span> },
    { title: '状态', dataIndex: 'status', render: (t: string) => <Tag color={STATUS_COLOR[t as ExpenseStatus]}>{EXPENSE_STATUS_LABEL[t as ExpenseStatus]}</Tag> },
    { title: '当前节点', dataIndex: 'currentNode', render: (t: string) => t },
    { title: '凭证号', dataIndex: 'voucherNo', render: (t: string) => t ?? '--' },
    { title: '操作', key: 'op', render: (_: any, r: ExpenseClaim) => (
        <Space wrap>
          {can('expense:manage') && (r.status === 'submitted' || r.status === 'approved') && <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => doApprove(r.id)}>审核</Button>}
          {can('expense:manage') && r.status === 'submitted' && <Popconfirm title="确认驳回？" onConfirm={() => doReject(r.id)}><Button type="link" size="small" danger icon={<CloseOutlined />}>驳回</Button></Popconfirm>}
          {can('expense:manage') && r.status === 'approved' && <Button type="link" size="small" icon={<PayCircleOutlined />} onClick={() => doPay(r.id)}>支付</Button>}
          {can('expense:manage') && !r.voucherNo && r.status !== 'rejected' && r.status !== 'draft' && <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => doVoucher(r.id)}>生成凭证</Button>}
        </Space>
      ) },
  ]

  const statCards = (['submitted', 'approved', 'rejected', 'paid'] as ExpenseStatus[]).map((st) => (
    <Col xs={12} md={6} key={st}>
      <Card className="shadow-card">
        <Statistic title={EXPENSE_STATUS_LABEL[st]} value={stats[st]?.count ?? 0} suffix="单" />
        <div className="mt-1 text-[12px] text-ink-500 dark:text-white/45">合计 {money(stats[st]?.amount ?? 0)}</div>
      </Card>
    </Col>
  ))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">费用报销管理</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">员工报销单提交、多级审核流转、支付与自动生成凭证（闭环同步账务）。</p>
      </div>

      <Row gutter={[16, 16]}>{statCards}</Row>

      <Tabs defaultActiveKey="claim" items={[
        {
          key: 'claim', label: '报销单',
          children: (
            <Card className="shadow-card" extra={
              <Space>
                <Select value={statusFilter} style={{ width: 130 }} onChange={setStatusFilter} options={[{ value: 'all', label: '全部状态' }, ...(['submitted', 'approved', 'rejected', 'paid'] as ExpenseStatus[]).map((s) => ({ value: s, label: EXPENSE_STATUS_LABEL[s] }))]} />
                {can('expense:create') && <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>新增报销</Button>}
              </Space>
            }>
              <Table rowKey="id" columns={columns} dataSource={claims} pagination={{ pageSize: 8 }} size="middle" />
            </Card>
          ),
        },
        {
          key: 'ledger', label: '报销台账',
          children: (
            <Card className="shadow-card">
              <Table rowKey="id" columns={columns} dataSource={claims} pagination={false} size="middle" />
            </Card>
          ),
        },
      ]} />

      <Modal title="新增报销单" open={modal} onOk={submit} onCancel={() => setModal(false)} okText="提交" cancelText="取消" destroyOnClose width={680}>
        <Form form={form} layout="vertical" className="mt-3">
          <Space size="large" className="flex">
            <Form.Item name="applicant" label="申请人" rules={[{ required: true }]} className="flex-1"><Input placeholder="姓名" /></Form.Item>
            <Form.Item name="department" label="部门" rules={[{ required: true }]} className="flex-1"><Input placeholder="如 销售部" /></Form.Item>
            <Form.Item name="date" label="日期" rules={[{ required: true }]} className="flex-1"><DatePicker className="w-full" /></Form.Item>
          </Space>
          <Form.List name="items" rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少一条报销明细') } }]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} align="baseline" className="flex flex-wrap" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...rest} name={[name, 'category']} rules={[{ required: true, message: '类别' }]}><Input placeholder="类别" style={{ width: 120 }} /></Form.Item>
                    <Form.Item {...rest} name={[name, 'summary']} rules={[{ required: true, message: '摘要' }]}><Input placeholder="摘要" style={{ width: 220 }} /></Form.Item>
                    <Form.Item {...rest} name={[name, 'amount']} rules={[{ required: true, message: '金额' }]}><InputNumber min={0} precision={2} prefix="¥" placeholder="金额" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'accountCode']}><Input placeholder="科目编码(可选)" style={{ width: 130 }} /></Form.Item>
                    {fields.length > 1 && <CloseOutlined onClick={() => remove(name)} className="cursor-pointer text-ink-400" />}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加明细</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="remark" label="备注" className="mt-3"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
