import { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Select, DatePicker, InputNumber, Input, Tag, App as AntdApp, Space } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  listExchangeRates, saveExchangeRate, deleteExchangeRate,
  FOREIGN_CURRENCIES, currencyLabel,
} from '@/services/exchangeRateService'
import type { ExchangeRate } from '@/types/models'

export function ExchangeRatePage() {
  const { message } = AntdApp.useApp()
  const [data, setData] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ExchangeRate | null>(null)
  const [form] = Form.useForm()

  const refresh = async () => {
    setLoading(true)
    setData(await listExchangeRates())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ date: dayjs() })
    setModalOpen(true)
  }
  const openEdit = (r: ExchangeRate) => {
    setEditing(r)
    form.resetFields()
    form.setFieldsValue({ currency: r.currency, date: dayjs(r.date), rate: r.rate, remark: r.remark })
    setModalOpen(true)
  }
  const submit = async () => {
    const vals = await form.validateFields()
    const payload: ExchangeRate = {
      id: editing?.id ?? '',
      currency: vals.currency,
      date: (vals.date as dayjs.Dayjs).format('YYYY-MM-DD'),
      rate: Number(vals.rate),
      remark: vals.remark,
    }
    await saveExchangeRate(payload)
    message.success(editing ? '汇率已更新' : '汇率已添加')
    setModalOpen(false)
    refresh()
  }
  const remove = async (r: ExchangeRate) => {
    await deleteExchangeRate(r.id)
    message.success('已删除')
    refresh()
  }

  const columns: ColumnsType<ExchangeRate> = [
    { title: '币种', dataIndex: 'currency', width: 120, render: (c) => <Tag color="purple">{currencyLabel(c)}（{c}）</Tag> },
    { title: '生效日期', dataIndex: 'date', width: 130 },
    {
      title: '汇率（1 外币 = ? 本位币）', dataIndex: 'rate', width: 200, align: 'right',
      render: (v: number) => <span className="tabular-nums font-medium">{v?.toFixed(4)}</span>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', key: 'action', width: 130,
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(r)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">汇率表</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            维护各外币对本位币（CNY）的记账汇率，按生效日期取最新值。录入外币凭证时自动带出，亦可手动调整。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增汇率</Button>
      </div>

      <Card className="shadow-card" styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} size="middle" />
      </Card>

      <Modal
        title={editing ? '编辑汇率' : '新增汇率'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="currency" label="币种" rules={[{ required: true, message: '请选择币种' }]}>
            <Select
              disabled={!!editing}
              options={FOREIGN_CURRENCIES.map((c) => ({ value: c, label: `${currencyLabel(c)}（${c}）` }))}
              placeholder="选择外币"
            />
          </Form.Item>
          <Form.Item name="date" label="生效日期" rules={[{ required: true, message: '请选择生效日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rate" label="汇率（1 外币 = ? 本位币）" rules={[{ required: true, message: '请输入汇率' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.0001} placeholder="如 7.18" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="选填，如 月初基准汇率" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
