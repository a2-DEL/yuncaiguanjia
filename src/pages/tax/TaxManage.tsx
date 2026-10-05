import { useEffect, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp,
  Space, Popconfirm, DatePicker, Row, Col, Statistic, Dropdown,
} from 'antd'
import { PlusOutlined, DeleteOutlined, StopOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listInvoices, createInvoice, updateInvoice, cancelInvoice, deleteInvoice, getTaxSummary, getTaxReturnRows,
} from '@/services/taxService'
import { INVOICE_TYPE_LABEL, INVOICE_STATUS_LABEL, type Invoice, type InvoiceType } from '@/types/models'
import { money, currentPeriod } from '@/utils/format'
import { SubjectTreeSelect } from '@/components/SubjectTreeSelect'
import { usePermission } from '@/hooks/usePermission'
import { exportCsv, exportXlsx } from '@/utils/exporter'

export function TaxManagePage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [period, setPeriod] = useState(currentPeriod())
  const [summary, setSummary] = useState<any>(null)

  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setInvoices(await listInvoices(typeFilter === 'all' ? {} : { type: typeFilter as InvoiceType }))
  }
  const loadSummary = async () => { setSummary(await getTaxSummary(period)) }

  useEffect(() => { load() }, [typeFilter])
  useEffect(() => { loadSummary() }, [period])

  const openModal = () => {
    form.setFieldsValue({ type: 'sales', date: dayjs(), taxRate: 0.13, offsetAccountCode: '1122' })
    setModal(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    await createInvoice({
      type: v.type, invoiceNo: v.invoiceNo, date: (v.date as Dayjs).format('YYYY-MM-DD'),
      counterparty: v.counterparty, taxNo: v.taxNo, amount: v.amount, taxRate: v.taxRate, remark: v.remark,
    })
    message.success('发票已登记'); setModal(false); load(); loadSummary()
  }

  const doCancel = async (id: string) => { await cancelInvoice(id); message.success('已作废'); load(); loadSummary() }

  const buildExportSheets = async () => {
    const rows = await getTaxReturnRows(period)
    const all = await listInvoices()
    const inv = all.filter((i) => i.period === period && i.status === 'normal')
    const returnSheet = {
      name: '增值税申报表',
      header: ['项目', '行次/说明', '金额'],
      rows: rows.map((r) => [r.section, r.label, r.amount]),
    }
    const detailSheet = {
      name: '发票明细',
      header: ['发票号', '类型', '日期', '购销方', '税率', '不含税金额', '税额', '价税合计'],
      rows: inv.map((i) => [
        i.invoiceNo, INVOICE_TYPE_LABEL[i.type], i.date, i.counterparty,
        `${(i.taxRate * 100).toFixed(0)}%`, i.amount, i.taxAmount, i.totalAmount,
      ]),
    }
    return { returnSheet, detailSheet }
  }

  const onExportCsv = async () => {
    const { returnSheet } = await buildExportSheets()
    exportCsv(`增值税申报表_${period}.csv`, returnSheet)
    message.success('CSV 已导出')
  }

  const onExportXlsx = async () => {
    const { returnSheet, detailSheet } = await buildExportSheets()
    exportXlsx(`增值税申报表_${period}.xlsx`, [returnSheet, detailSheet], [2, 5, 6, 7])
    message.success('Excel 已导出')
  }

  const columns = [
    { title: '发票号', dataIndex: 'invoiceNo', width: 160 },
    { title: '类型', dataIndex: 'type', render: (t: string) => <Tag color={t === 'sales' ? 'blue' : 'green'}>{INVOICE_TYPE_LABEL[t as InvoiceType]}</Tag> },
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '购销方', dataIndex: 'counterparty', render: (t: string) => <span className="font-medium">{t}</span> },
    { title: '不含税金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '税率', dataIndex: 'taxRate', align: 'right' as const, render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { title: '税额', dataIndex: 'taxAmount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '价税合计', dataIndex: 'totalAmount', align: 'right' as const, render: (v: number) => <span className="tabular-nums font-medium">{money(v)}</span> },
    { title: '状态', dataIndex: 'status', render: (t: string) => <Tag color={t === 'normal' ? 'green' : 'red'}>{INVOICE_STATUS_LABEL[t as keyof typeof INVOICE_STATUS_LABEL]}</Tag> },
    { title: '关联凭证', dataIndex: 'voucherNo', render: (t: string) => t ? <Tag color="cyan">{t}</Tag> : '--' },
    { title: '操作', key: 'op', render: (_: any, r: Invoice) => (
        <Space>
          {can('tax:manage') && r.status === 'normal' && <Popconfirm title="确认作废该发票？" onConfirm={() => doCancel(r.id)}><Button type="link" size="small" icon={<StopOutlined />}>作废</Button></Popconfirm>}
          {can('tax:manage') && <Popconfirm title="确认删除？" onConfirm={async () => { await deleteInvoice(r.id); message.success('已删除'); load() }}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
        </Space>
      ) },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">税务管理</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">进/销项发票登记、税负统计与税务台账，辅助期末报税核对。</p>
      </div>

      {summary && (
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="销项不含税" value={summary.salesAmount} precision={2} prefix="¥" /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="销项税额" value={summary.salesTax} precision={2} prefix="¥" valueStyle={{ color: '#1B5FE3' }} /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="进项税额" value={summary.purchaseTax} precision={2} prefix="¥" valueStyle={{ color: '#0E9F6E' }} /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title={`${summary.period} 应交增值税`} value={summary.netTax} precision={2} prefix="¥" valueStyle={{ color: summary.netTax >= 0 ? '#FAAD14' : '#FF4D4F' }} /></Card></Col>
        </Row>
      )}

      <Tabs defaultActiveKey="invoice" items={[
        {
          key: 'invoice', label: '发票登记',
          children: (
            <Card className="shadow-card" extra={
              <Space>
                <DatePicker picker="month" value={dayjs(period + '-01')} onChange={(d) => setPeriod((d as Dayjs).format('YYYY-MM'))} />
                <Select value={typeFilter} style={{ width: 130 }} onChange={setTypeFilter} options={[{ value: 'all', label: '全部类型' }, { value: 'sales', label: '销项' }, { value: 'purchase', label: '进项' }]} />
                {can('tax:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>登记发票</Button>}
                <Dropdown menu={{ items: [
                  { key: 'xlsx', label: '导出 Excel（申报表+明细）' },
                  { key: 'csv', label: '导出 CSV（申报表）' },
                ], onClick: ({ key }) => key === 'xlsx' ? onExportXlsx() : onExportCsv() }}>
                  <Button icon={<DownloadOutlined />}>导出申报表</Button>
                </Dropdown>
              </Space>
            }>
              <Table rowKey="id" columns={columns} dataSource={invoices} pagination={{ pageSize: 8 }} size="middle" />
            </Card>
          ),
        },
        {
          key: 'ledger', label: '税务台账',
          children: (
            <Card className="shadow-card" title={`${period} 税务台账`} extra={
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>登记发票</Button>
                <Dropdown menu={{ items: [
                  { key: 'xlsx', label: '导出 Excel（申报表+明细）' },
                  { key: 'csv', label: '导出 CSV（申报表）' },
                ], onClick: ({ key }) => key === 'xlsx' ? onExportXlsx() : onExportCsv() }}>
                  <Button icon={<DownloadOutlined />}>导出申报表</Button>
                </Dropdown>
              </Space>
            }>
              <Table rowKey="id" columns={columns} dataSource={invoices} pagination={false} size="middle" />
            </Card>
          ),
        },
      ]} />

      <Modal title="登记发票" open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="type" label="发票类型" rules={[{ required: true }]}><Select options={[{ value: 'sales', label: '销项发票（开给客户）' }, { value: 'purchase', label: '进项发票（收到供应商）' }]} /></Form.Item>
          <Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true, message: '请输入发票号码' }]}><Input placeholder="如 4413200000001" /></Form.Item>
          <Form.Item name="date" label="开票日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="counterparty" label="购销方名称" rules={[{ required: true, message: '请输入对方单位' }]}><Input /></Form.Item>
          <Form.Item name="taxNo" label="税号"><Input /></Form.Item>
          <Form.Item name="amount" label="不含税金额" rules={[{ required: true, message: '请输入金额' }]}><InputNumber className="w-full" min={0} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="taxRate" label="税率" rules={[{ required: true }]}><InputNumber className="w-full" min={0} max={1} step={0.01} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="offsetAccountCode" label="结算科目（对方科目，可选）" tooltip="销项默认应收账款 1122，进项默认应付账款 2202；登记时自动据此生成凭证">
            <SubjectTreeSelect placeholder="默认：销项→应收账款1122 / 进项→应付账款2202" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
