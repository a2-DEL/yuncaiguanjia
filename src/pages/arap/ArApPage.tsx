import { useEffect, useState } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp, Space, Empty, DatePicker,
} from 'antd'
import { PlusOutlined, CheckOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listArApBills, createArApBill, settleBill, generateVoucherForBill, type ArApFilter,
} from '@/services/arApBillService'
import { listContacts } from '@/services/contactService'
import { ARAP_DIRECTION_LABEL, ARAP_STATUS_LABEL, type ArApBill, type ArApDirection } from '@/types/models'
import { money } from '@/utils/format'

const statusColor: Record<string, string> = { open: 'red', partial: 'orange', closed: 'green' }

export function ArApPage() {
  const { message } = AntdApp.useApp()
  const [bills, setBills] = useState<ArApBill[]>([])
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [direction, setDirection] = useState<ArApDirection | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [settle, setSettle] = useState<{ id: string; amount: number } | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    const filter: ArApFilter = direction === 'all' ? {} : { direction }
    setBills(await listArApBills(filter))
    setLoading(false)
  }
  useEffect(() => { load() }, [direction])
  useEffect(() => { listContacts().then((c) => setContacts(c.map((x) => ({ id: x.id, name: x.name })))) }, [])
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? id

  const submit = async () => {
    const v = await form.validateFields()
    await createArApBill({
      direction: v.direction,
      contactId: v.contactId,
      billNo: v.billNo,
      date: (v.date as Dayjs).format('YYYY-MM-DD'),
      dueDate: v.dueDate ? (v.dueDate as Dayjs).format('YYYY-MM-DD') : undefined,
      amount: v.amount,
      subject: v.subject,
    })
    message.success('往来单已登记'); setModal(false); form.resetFields(); load()
  }

  const doSettle = async () => {
    if (!settle) return
    await settleBill(settle.id, settle.amount)
    message.success('已结算'); setSettle(null); load()
  }

  const doVoucher = async (id: string) => {
    const no = await generateVoucherForBill(id)
    message.success(`已生成凭证 ${no}`); load()
  }

  const columns = [
    { title: '单号', dataIndex: 'billNo', width: 150 },
    { title: '类型', dataIndex: 'direction', width: 90, render: (t: ArApDirection) => <Tag color={t === 'receivable' ? 'blue' : 'purple'}>{ARAP_DIRECTION_LABEL[t]}</Tag> },
    { title: '往来单位', dataIndex: 'contactId', render: (id: string) => contactName(id) },
    { title: '摘要', dataIndex: 'subject', ellipsis: true },
    { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '已结', dataIndex: 'settled', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '状态', dataIndex: 'status', width: 90, render: (t: string) => <Tag color={statusColor[t]}>{ARAP_STATUS_LABEL[t as keyof typeof ARAP_STATUS_LABEL]}</Tag> },
    { title: '关联凭证', dataIndex: 'voucherNo', width: 130, render: (t?: string) => t ? <Tag color="cyan">{t}</Tag> : '--' },
    {
      title: '操作', key: 'op', width: 200, render: (_: unknown, r: ArApBill) => (
        <Space>
          {!r.voucherNo && <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => doVoucher(r.id)}>生成凭证</Button>}
          {r.status !== 'closed' && <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => setSettle({ id: r.id, amount: Math.round((r.amount - r.settled) * 100) / 100 })}>结算</Button>}
        </Space>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">应收应付（往来单据）</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            采购/销售产生的应收应付往来单登记与结算，并可一键生成收/付款凭证，实现业务到账务的联动闭环。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)}>登记往来单</Button>
      </div>

      <Card className="shadow-card" styles={{ body: { padding: 16 } }}>
        <Space className="mb-3">
          <Select
            value={direction}
            style={{ width: 160 }}
            onChange={(v) => setDirection(v)}
            options={[{ value: 'all', label: '全部' }, { value: 'receivable', label: '应收' }, { value: 'payable', label: '应付' }]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={bills}
          pagination={{ pageSize: 10 }}
          size="middle"
          locale={{ emptyText: <Empty description="暂无往来单" /> }}
        />
      </Card>

      <Modal title="登记往来单" open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="direction" label="类型" rules={[{ required: true }]} initialValue="receivable">
            <Select options={[{ value: 'receivable', label: '应收（客户欠款）' }, { value: 'payable', label: '应付（欠供应商）' }]} />
          </Form.Item>
          <Form.Item name="contactId" label="往来单位" rules={[{ required: true, message: '请选择往来单位' }]}>
            <Select showSearch optionFilterProp="label" options={contacts.map((c) => ({ value: c.id, label: c.name }))} placeholder="选择客户/供应商" />
          </Form.Item>
          <Form.Item name="billNo" label="单据编号" rules={[{ required: true, message: '请输入单据编号' }]}><Input placeholder="如 AP-2026-001" /></Form.Item>
          <Form.Item name="subject" label="业务摘要" rules={[{ required: true, message: '请输入摘要' }]}><Input placeholder="如 采购原材料" /></Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><InputNumber className="w-full" min={0} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="date" label="单据日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="dueDate" label="到期日"><DatePicker className="w-full" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="结算往来单" open={!!settle} onOk={doSettle} onCancel={() => setSettle(null)} okText="确认结算" cancelText="取消" destroyOnClose>
        {settle && (
          <div className="space-y-3 py-2">
            <div className="text-[13px] text-ink-600 dark:text-white/70">本次结算金额</div>
            <InputNumber
              className="w-full"
              min={0}
              precision={2}
              prefix="¥"
              value={settle.amount}
              onChange={(v) => setSettle({ ...settle, amount: Number(v) || 0 })}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
