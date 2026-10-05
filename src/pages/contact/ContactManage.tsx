import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp,
  Space, Popconfirm, DatePicker, Row, Col,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listContacts, createContact, updateContact, deleteContact,
  listArApBills, createArApBill, deleteArApBill, settleBill, getOverdueBills,
} from '@/services/contactService'
import { listBankAccounts } from '@/services/bankService'
import {
  CONTACT_TYPE_LABEL, ARAP_DIRECTION_LABEL, ARAP_STATUS_LABEL,
  type Contact, type ContactType, type ArApBill, type ArApDirection, type BankAccount,
} from '@/types/models'
import { money } from '@/utils/format'
import { usePermission } from '@/hooks/usePermission'

export function ContactManagePage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTypeFilter, setContactTypeFilter] = useState<string>('all')
  const [bills, setBills] = useState<ArApBill[]>([])
  const [dirFilter, setDirFilter] = useState<string>('all')
  const [overdue, setOverdue] = useState<ArApBill[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])

  const [contactModal, setContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm] = Form.useForm()

  const [billModal, setBillModal] = useState(false)
  const [billForm] = Form.useForm()

  const [settleModal, setSettleModal] = useState(false)
  const [settleTarget, setSettleTarget] = useState<ArApBill | null>(null)
  const [settleForm] = Form.useForm()

  const contactNameMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach((c) => m.set(c.id, c.name))
    return m
  }, [contacts])

  const loadContacts = async () => {
    const list = await listContacts(contactTypeFilter === 'all' ? undefined : (contactTypeFilter as ContactType))
    setContacts(list)
  }
  const loadBills = async () => {
    const list = await listArApBills({ direction: dirFilter === 'all' ? undefined : (dirFilter as ArApDirection) })
    setBills(list)
  }

  useEffect(() => { loadContacts() }, [contactTypeFilter])
  useEffect(() => { loadBills() }, [dirFilter])
  useEffect(() => { getOverdueBills().then(setOverdue) }, [bills])
  useEffect(() => { listBankAccounts().then(setAccounts) }, [])

  const openContactModal = (c?: Contact) => {
    setEditingContact(c ?? null)
    contactForm.setFieldsValue(c ? { ...c } : { type: 'customer' })
    setContactModal(true)
  }
  const submitContact = async () => {
    const v = await contactForm.validateFields()
    if (editingContact) { await updateContact(editingContact.id, v); message.success('已更新') }
    else { await createContact(v); message.success('已新增') }
    setContactModal(false); loadContacts()
  }

  const openBillModal = () => {
    if (contacts.length === 0) { message.warning('请先新增往来单位'); return }
    billForm.setFieldsValue({ date: dayjs(), direction: 'receivable' })
    setBillModal(true)
  }
  const submitBill = async () => {
    const v = await billForm.validateFields()
    await createArApBill({
      direction: v.direction, contactId: v.contactId, date: (v.date as Dayjs).format('YYYY-MM-DD'),
      dueDate: v.dueDate ? (v.dueDate as Dayjs).format('YYYY-MM-DD') : undefined,
      amount: v.amount, subject: v.subject,
    })
    message.success('单据已登记'); setBillModal(false); loadBills()
  }

  const openSettle = (b: ArApBill) => {
    setSettleTarget(b)
    settleForm.setFieldsValue({ date: dayjs(), amount: Math.round((b.amount - b.settled) * 100) / 100 })
    setSettleModal(true)
  }
  const submitSettle = async () => {
    const v = await settleForm.validateFields()
    if (!settleTarget) return
    if (v.amount > settleTarget.amount - settleTarget.settled + 0.005) { message.error('核销金额不能超过未结算余额'); return }
    await settleBill(settleTarget.id, { amount: v.amount, date: (v.date as Dayjs).format('YYYY-MM-DD'), accountId: v.accountId })
    message.success('核销成功'); setSettleModal(false); loadBills()
  }

  const contactColumns = [
    { title: '编码', dataIndex: 'code', width: 90 },
    { title: '名称', dataIndex: 'name', render: (t: string) => <span className="font-medium">{t}</span> },
    { title: '类型', dataIndex: 'type', render: (t: string) => <Tag color={t === 'customer' ? 'blue' : 'purple'}>{CONTACT_TYPE_LABEL[t as keyof typeof CONTACT_TYPE_LABEL]}</Tag> },
    { title: '联系电话', dataIndex: 'phone', render: (t: string) => t ?? '--' },
    { title: '税号', dataIndex: 'taxNo', render: (t: string) => t ?? '--' },
    { title: '信用额度', dataIndex: 'creditLimit', render: (v: number) => v ? money(v) : '—' },
    { title: '操作', key: 'op', render: (_: any, r: Contact) => (
        <Space>
          {can('contact:manage') && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openContactModal(r)}>编辑</Button>}
          {can('contact:manage') && <Popconfirm title="确认删除？" onConfirm={async () => { await deleteContact(r.id); message.success('已删除'); loadContacts() }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>}
        </Space>
      ) },
  ]

  const billColumns = [
    { title: '单据号', dataIndex: 'billNo', width: 130 },
    { title: '方向', dataIndex: 'direction', render: (t: string) => <Tag color={t === 'receivable' ? 'blue' : 'volcano'}>{ARAP_DIRECTION_LABEL[t as keyof typeof ARAP_DIRECTION_LABEL]}</Tag> },
    { title: '往来单位', dataIndex: 'contactId', render: (id: string) => contactNameMap.get(id) },
    { title: '业务摘要', dataIndex: 'subject' },
    { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '已结算', dataIndex: 'settled', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '余额', key: 'remain', align: 'right' as const, render: (_: any, r: ArApBill) => <span className="tabular-nums font-medium">{money(r.amount - r.settled)}</span> },
    { title: '到期日', dataIndex: 'dueDate', render: (t: string) => t ?? '—' },
    { title: '状态', dataIndex: 'status', render: (t: string) => {
        const c = t === 'closed' ? 'green' : t === 'partial' ? 'orange' : 'red'
        return <Tag color={c}>{ARAP_STATUS_LABEL[t as keyof typeof ARAP_STATUS_LABEL]}</Tag>
      } },
    { title: '关联凭证', dataIndex: 'voucherNo', render: (t: string) => t ? <Tag color="cyan">{t}</Tag> : '--' },
    { title: '操作', key: 'op', render: (_: any, r: ArApBill) => (
        <Space>
          {can('contact:manage') && r.status !== 'closed' && <Button type="link" size="small" onClick={() => openSettle(r)}>核销</Button>}
          {can('contact:manage') && <Popconfirm title="确认删除该单据？" onConfirm={async () => { await deleteArApBill(r.id); message.success('已删除'); loadBills() }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>}
        </Space>
      ) },
  ]

  const overdueColumns = [
    { title: '单据号', dataIndex: 'billNo', width: 130 },
    { title: '方向', dataIndex: 'direction', render: (t: string) => <Tag color={t === 'receivable' ? 'blue' : 'volcano'}>{ARAP_DIRECTION_LABEL[t as keyof typeof ARAP_DIRECTION_LABEL]}</Tag> },
    { title: '往来单位', dataIndex: 'contactId', render: (id: string) => contactNameMap.get(id) },
    { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '未结算', key: 'remain', align: 'right' as const, render: (_: any, r: ArApBill) => <span className="tabular-nums font-medium text-[#FF4D4F]">{money(r.amount - r.settled)}</span> },
    { title: '到期日', dataIndex: 'dueDate' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">往来账款管理</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">客户与供应商档案、应收应付单据登记、核销对账与逾期预警。</p>
      </div>

      <Tabs defaultActiveKey="contact" items={[
        {
          key: 'contact', label: '客户 / 供应商',
          children: (
            <Card className="shadow-card" extra={
              <Space>
                <Select value={contactTypeFilter} style={{ width: 130 }} onChange={setContactTypeFilter} options={[{ value: 'all', label: '全部类型' }, { value: 'customer', label: '客户' }, { value: 'supplier', label: '供应商' }]} />
                {can('contact:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => openContactModal()}>新增单位</Button>}
              </Space>
            }>
              <Table rowKey="id" columns={contactColumns} dataSource={contacts} pagination={{ pageSize: 8 }} size="middle" />
            </Card>
          ),
        },
        {
          key: 'bill', label: '应收应付单据',
          children: (
            <Card className="shadow-card" extra={
              <Space>
                <Select value={dirFilter} style={{ width: 130 }} onChange={setDirFilter} options={[{ value: 'all', label: '全部方向' }, { value: 'receivable', label: '应收' }, { value: 'payable', label: '应付' }]} />
                {can('contact:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={openBillModal}>登记单据</Button>}
              </Space>
            }>
              <Table rowKey="id" columns={billColumns} dataSource={bills} pagination={{ pageSize: 8 }} size="middle" />
            </Card>
          ),
        },
        {
          key: 'overdue', label: <span><WarningOutlined className="mr-1 text-[#FF4D4F]" />逾期预警 ({overdue.length})</span>,
          children: (
            <Card className="shadow-card">
              {overdue.length === 0 ? <div className="py-10 text-center text-ink-500 dark:text-white/45">暂无逾期单据，账期健康 ✓</div> :
                <Table rowKey="id" columns={overdueColumns} dataSource={overdue} pagination={false} size="middle" />}
            </Card>
          ),
        },
      ]} />

      <Modal title={editingContact ? '编辑往来单位' : '新增往来单位'} open={contactModal} onOk={submitContact} onCancel={() => setContactModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={contactForm} layout="vertical" className="mt-3">
          <Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={[{ value: 'customer', label: '客户' }, { value: 'supplier', label: '供应商' }]} /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="单位名称" /></Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}><Input placeholder="如 C0001 / S0001" /></Form.Item>
          <Form.Item name="phone" label="联系电话"><Input /></Form.Item>
          <Form.Item name="taxNo" label="税号"><Input /></Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="creditLimit" label="信用额度"><InputNumber className="w-full" min={0} precision={2} prefix="¥" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="登记应收应付单据" open={billModal} onOk={submitBill} onCancel={() => setBillModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={billForm} layout="vertical" className="mt-3">
          <Form.Item name="direction" label="方向" rules={[{ required: true }]}><Select options={[{ value: 'receivable', label: '应收' }, { value: 'payable', label: '应付' }]} /></Form.Item>
          <Form.Item name="contactId" label="往来单位" rules={[{ required: true, message: '请选择单位' }]}><Select options={contacts.map((c) => ({ value: c.id, label: `${c.name}` }))} /></Form.Item>
          <Form.Item name="subject" label="业务摘要" rules={[{ required: true }]}><Input placeholder="如：销售货款 / 采购物资" /></Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><InputNumber className="w-full" min={0.01} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="date" label="业务日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="dueDate" label="到期日"><DatePicker className="w-full" /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`核销单据 ${settleTarget?.billNo ?? ''}`} open={settleModal} onOk={submitSettle} onCancel={() => setSettleModal(false)} okText="确认核销" cancelText="取消" destroyOnClose>
        <Form form={settleForm} layout="vertical" className="mt-3">
          <div className="mb-3 text-[13px] text-ink-500 dark:text-white/55">
            未结算余额：<span className="font-medium text-ink-900 dark:text-white">{money(settleTarget ? settleTarget.amount - settleTarget.settled : 0)}</span>
          </div>
          <Form.Item name="amount" label="核销金额" rules={[{ required: true, message: '请输入核销金额' }]}><InputNumber className="w-full" min={0.01} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="date" label="结算日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="accountId" label="结算账户（同步生成资金流水）"><Select allowClear options={accounts.map((a) => ({ value: a.id, label: a.name }))} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
