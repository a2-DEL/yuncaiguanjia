import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp,
  Space, Popconfirm, DatePicker, Row, Col, Statistic, Alert,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ToolOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listAssets, createAsset, updateAsset, disposeAsset, runDepreciation, listDepreciations, getAssetSummary,
  getDepreciationOpeningInfo, runDepreciationOpening, type DepreciationOpeningInfo,
} from '@/services/assetService'
import {
  ASSET_CATEGORY_LABEL, ASSET_STATUS_LABEL, type Asset, type AssetCategory, type DepreciationMethod,
} from '@/types/models'
import { money, currentPeriod } from '@/utils/format'
import { usePermission } from '@/hooks/usePermission'

export function AssetManagePage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [assets, setAssets] = useState<Asset[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [period, setPeriod] = useState(currentPeriod())
  const [records, setRecords] = useState<any[]>([])
  const [opening, setOpening] = useState<DepreciationOpeningInfo | null>(null)
  const [openingLoading, setOpeningLoading] = useState(false)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    const list = await listAssets()
    setAssets(list)
    setSummary(await getAssetSummary())
  }
  const loadRecords = async () => { setRecords(await listDepreciations(period)) }

  useEffect(() => { load() }, [])
  useEffect(() => { loadRecords() }, [period])

  const loadOpening = async () => {
    setOpeningLoading(true)
    try { setOpening(await getDepreciationOpeningInfo()) } finally { setOpeningLoading(false) }
  }
  useEffect(() => { loadOpening() }, [])

  const openModal = (a?: Asset) => {
    setEditing(a ?? null)
    form.setFieldsValue(a ? { ...a, startDate: dayjs(a.startDate), salvageRate: Math.round(a.salvageRate * 100) } : { category: 'office', depreciationMethod: 'straight', salvageRate: 5, usefulLife: 36 })
    setModal(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    const payload = {
      code: v.code, name: v.name, category: v.category, spec: v.spec, department: v.department, user: v.user,
      originalValue: v.originalValue, salvageRate: (v.salvageRate ?? 0) / 100, usefulLife: v.usefulLife,
      depreciationMethod: v.depreciationMethod, startDate: (v.startDate as Dayjs).format('YYYY-MM-DD'),
    }
    if (editing) { await updateAsset(editing.id, payload); message.success('已更新') }
    else { await createAsset(payload); message.success('已新增') }
    setModal(false); load()
  }

  const doDepreciate = async () => {
    const res = await runDepreciation(period)
    message.success(res.voucherNo
      ? `已计提 ${res.count} 笔，合计 ${money(res.total)}，已生成凭证 ${res.voucherNo}`
      : `已计提 ${res.count} 笔，合计 ${money(res.total)}`)
    load(); loadRecords()
  }

  const doOpening = async () => {
    if (!opening || opening.diff <= 0) return
    const res = await runDepreciationOpening(period)
    message.success(`期初累计折旧已补录 ¥${money(opening.diff)}，生成凭证 ${res.voucherNo}`)
    load(); loadOpening()
  }

  const assetNameMap = useMemo(() => { const m = new Map<string, string>(); assets.forEach((a) => m.set(a.id, a.name)); return m }, [assets])

  const columns = [
    { title: '资产编码', dataIndex: 'code', width: 100 },
    { title: '名称', dataIndex: 'name', render: (t: string) => <span className="font-medium">{t}</span> },
    { title: '类别', dataIndex: 'category', render: (t: string) => <Tag>{ASSET_CATEGORY_LABEL[t as AssetCategory]}</Tag> },
    { title: '规格', dataIndex: 'spec', render: (t: string) => t ?? '--' },
    { title: '部门', dataIndex: 'department', render: (t: string) => t ?? '--' },
    { title: '原值', dataIndex: 'originalValue', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '累计折旧', dataIndex: 'accumulatedDepreciation', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '净值', key: 'net', align: 'right' as const, render: (_: any, r: Asset) => <span className="tabular-nums font-medium">{money(r.originalValue - r.accumulatedDepreciation)}</span> },
    { title: '状态', dataIndex: 'status', render: (t: string) => <Tag color={t === 'in_use' ? 'green' : t === 'idle' ? 'default' : 'red'}>{ASSET_STATUS_LABEL[t as keyof typeof ASSET_STATUS_LABEL]}</Tag> },
    { title: '操作', key: 'op', render: (_: any, r: Asset) => (
        <Space>
          {can('asset:manage') && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>编辑</Button>}
          {can('asset:manage') && r.status === 'in_use' && <Popconfirm title="确认清理该资产？" onConfirm={async () => { await disposeAsset(r.id); message.success('已清理'); load() }}><Button type="link" size="small">清理</Button></Popconfirm>}
        </Space>
      ) },
  ]

  const recordColumns = [
    { title: '期间', dataIndex: 'period', width: 100 },
    { title: '资产', dataIndex: 'assetId', render: (id: string) => assetNameMap.get(id) },
    { title: '本期折旧', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '累计折旧', dataIndex: 'accumulated', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{money(v)}</span> },
    { title: '关联凭证', dataIndex: 'voucherNo', render: (t: string) => t ? <Tag color="cyan">{t}</Tag> : '--' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">固定资产管理</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">资产卡片登记、自动计提折旧、折旧台账与资产清理。</p>
      </div>

      {summary && (
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="资产数量" value={summary.totalCount} suffix="项" /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="原值合计" value={summary.originalTotal} precision={2} prefix="¥" /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="累计折旧" value={summary.accumulatedTotal} precision={2} prefix="¥" /></Card></Col>
          <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="净值合计" value={summary.netTotal} precision={2} prefix="¥" valueStyle={{ color: '#0E9F6E' }} /></Card></Col>
        </Row>
      )}

      <Tabs defaultActiveKey="card" items={[
        {
          key: 'card', label: '资产卡片',
          children: (
            <Card className="shadow-card" extra={can('asset:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新增资产</Button>}>
              <Table rowKey="id" columns={columns} dataSource={assets} pagination={{ pageSize: 8 }} size="middle" />
            </Card>
          ),
        },
        {
          key: 'dep', label: '折旧计提',
          children: (
            <Card className="shadow-card" extra={<Space><DatePicker picker="month" value={dayjs(period + '-01')} onChange={(d) => setPeriod((d as Dayjs).format('YYYY-MM'))} />{can('asset:manage') && <Button type="primary" icon={<ToolOutlined />} onClick={doDepreciate}>计提{period}折旧</Button>}</Space>}>
              <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="middle"
                locale={{ emptyText: `暂无 ${period} 折旧记录，点击右上角计提` }}
              />
            </Card>
          ),
        },
        {
          key: 'ledger', label: '折旧台账',
          children: (
            <Card className="shadow-card">
              <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="middle" />
            </Card>
          ),
        },
        {
          key: 'opening', label: '期初折旧补录',
          children: (
            <Card className="shadow-card" loading={openingLoading}
              extra={can('asset:manage') && opening && opening.diff > 0 && (
                <Button type="primary" icon={<ToolOutlined />} onClick={doOpening}>补录期初累计折旧</Button>
              )}
            >
              <Alert
                type="info" showIcon
                message="资产卡片累计折旧与总账对账"
                description="种子资产已带累计折旧，但总账「1602 累计折旧」尚无对应期初凭证。一键补录将生成一张期初调整凭证（借：利润分配，贷：累计折旧），使总账与资产卡片一致。差额法计算，可重复点击且不会重复入账。"
              />
              {opening && (
                <Row gutter={[16, 16]} className="mt-4">
                  <Col xs={24} md={8}><Card className="shadow-card"><Statistic title="资产卡片累计折旧合计" value={opening.cardTotal} precision={2} prefix="¥" /></Card></Col>
                  <Col xs={24} md={8}><Card className="shadow-card"><Statistic title="总账 1602 当前余额" value={opening.ledgerTotal} precision={2} prefix="¥" /></Card></Col>
                  <Col xs={24} md={8}><Card className="shadow-card"><Statistic
                    title="应补录差额"
                    value={opening.diff}
                    precision={2} prefix="¥"
                    valueStyle={{ color: opening.reconciled ? '#52C41A' : '#FAAD14' }}
                  /></Card></Col>
                </Row>
              )}
              {opening && (
                <div className="mt-4">
                  {opening.reconciled
                    ? <Tag color="success">已对齐：总账累计折旧与资产卡片一致，无需补录</Tag>
                    : <Tag color="warning">存在差异：总账 1602 低于资产卡片，请点击右上角补录</Tag>}
                </div>
              )}
            </Card>
          ),
        },
      ]} />

      <Modal title={editing ? '编辑资产' : '新增资产'} open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="code" label="资产编码" rules={[{ required: true, message: '请输入编码' }]}><Input placeholder="如 GD-0004" /></Form.Item>
          <Form.Item name="name" label="资产名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
          <Form.Item name="category" label="资产类别" rules={[{ required: true }]}><Select options={Object.entries(ASSET_CATEGORY_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item>
          <Form.Item name="spec" label="规格型号"><Input /></Form.Item>
          <Form.Item name="department" label="使用部门"><Input /></Form.Item>
          <Form.Item name="user" label="使用人"><Input /></Form.Item>
          <Form.Item name="originalValue" label="原值" rules={[{ required: true }]}><InputNumber className="w-full" min={0} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="salvageRate" label="残值率(%)" rules={[{ required: true }]}><InputNumber className="w-full" min={0} max={100} precision={2} /></Form.Item>
          <Form.Item name="usefulLife" label="使用年限(月)" rules={[{ required: true }]}><InputNumber className="w-full" min={1} /></Form.Item>
          <Form.Item name="depreciationMethod" label="折旧方法" rules={[{ required: true }]}><Select options={[{ value: 'straight', label: '直线法' }, { value: 'double', label: '双倍余额递减法' }]} /></Form.Item>
          <Form.Item name="startDate" label="开始使用日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
