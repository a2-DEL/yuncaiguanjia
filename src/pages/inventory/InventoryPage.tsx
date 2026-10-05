import { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, InputNumber, Space, Tag, App as AntdApp, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import { listGoods, createGood, createStockMove, listStockMoves, getInventorySummary, type InventorySummary } from '@/services/inventoryService'
import type { Good, StockMove, StockMoveType } from '@/types/models'
import { formatMoney } from '@/utils/format'

const { Title, Text } = Typography

export function InventoryPage() {
  const { message } = AntdApp.useApp()
  const [goods, setGoods] = useState<Good[]>([])
  const [moves, setMoves] = useState<StockMove[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [goodModal, setGoodModal] = useState(false)
  const [moveModal, setMoveModal] = useState(false)
  const [form] = Form.useForm()
  const [moveForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [g, m, s] = await Promise.all([listGoods(), listStockMoves(), getInventorySummary()])
    setGoods(g); setMoves(m); setSummary(s)
  }
  useEffect(() => { load() }, [])

  const addGood = async () => {
    const v = await form.validateFields()
    await createGood(v)
    message.success('已新增商品')
    setGoodModal(false); form.resetFields(); load()
  }

  const doMove = async () => {
    const v = await moveForm.validateFields()
    setSaving(true)
    try {
      const r = await createStockMove(v)
      message.success(`已${v.type === 'in' ? '入库' : '出库'}并生成凭证 ${r.voucherNo}`)
      setMoveModal(false); moveForm.resetFields(); load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const goodColumns: ColumnsType<Good> = [
    { title: '编码', dataIndex: 'code', width: 100 },
    { title: '名称', dataIndex: 'name' },
    { title: '规格', dataIndex: 'spec', render: (v) => v || '-' },
    { title: '单位', dataIndex: 'unit', width: 80, render: (v) => v || '-' },
    { title: '类别', dataIndex: 'category', width: 100, render: (v) => v || '-' },
  ]

  const moveColumns: ColumnsType<StockMove> = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '商品', dataIndex: 'goodsName' },
    { title: '类型', dataIndex: 'type', width: 90, render: (t: StockMoveType) => <Tag color={t === 'in' ? 'green' : 'blue'}>{t === 'in' ? '入库' : '出库'}</Tag> },
    { title: '数量', dataIndex: 'qty', width: 80 },
    { title: '单价', dataIndex: 'price', width: 100, align: 'right', render: (v: number) => formatMoney(v) },
    { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: (v: number) => formatMoney(v) },
    { title: '凭证号', dataIndex: 'voucherNo', width: 120, render: (v) => v || '-' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>进销存（轻量业财一体）</Title>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGoodModal(true)}>新增商品</Button>
          <Button icon={<ImportOutlined />} onClick={() => setMoveModal(true)}>出入库</Button>
        </Space>
      </div>

      <Space size="large" style={{ marginBottom: 16 }}>
        <Text>商品数：<b>{summary?.goodsCount ?? 0}</b></Text>
        <Text>入库金额：<b className="tabular-nums">{formatMoney(summary?.inAmount ?? 0)}</b></Text>
        <Text>出库金额：<b className="tabular-nums">{formatMoney(summary?.outAmount ?? 0)}</b></Text>
      </Space>

      <Card size="small" title="商品档案" style={{ marginBottom: 16 }}>
        <Table bordered size="small" pagination={{ pageSize: 20, showSizeChanger: false }} dataSource={goods} columns={goodColumns} rowKey="id" />
      </Card>

      <Card size="small" title="出入库流水（自动生成凭证）">
        <Table bordered size="small" pagination={{ pageSize: 30, showSizeChanger: false }} dataSource={moves} columns={moveColumns} rowKey="id" />
      </Card>

      <Modal title="新增商品" open={goodModal} onOk={addGood} onCancel={() => setGoodModal(false)} okText="保存" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}><Input placeholder="如 P001" /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
          <Form.Item name="spec" label="规格"><Input /></Form.Item>
          <Form.Item name="unit" label="单位"><Input placeholder="件/台/公斤" /></Form.Item>
          <Form.Item name="category" label="类别"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="出入库（自动生成凭证）" open={moveModal} onOk={doMove} confirmLoading={saving} onCancel={() => setMoveModal(false)} okText="提交" destroyOnClose>
        <Form form={moveForm} layout="vertical" initialValues={{ type: 'in' as StockMoveType }}>
          <Form.Item name="goodsId" label="商品" rules={[{ required: true, message: '请选择商品' }]}>
            <Select options={goods.map((g) => ({ value: g.id, label: `${g.code} ${g.name}` }))} showSearch optionFilterProp="label" placeholder="选择商品" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'in', label: '入库（采购）' }, { value: 'out', label: '出库（销售）' }]} />
          </Form.Item>
          <Space>
            <Form.Item name="qty" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber min={0.01} step={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="price" label="单价" rules={[{ required: true, message: '请输入单价' }]}>
              <InputNumber min={0} step={0.01} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="date" label="日期"><Input type="date" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
