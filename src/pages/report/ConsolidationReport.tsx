import { useEffect, useState } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, App as AntdApp, Statistic, Row, Col, Empty,
} from 'antd'
import { PlusOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listEntities, addEntity, getConsolidatedTrialBalance, getConsolidatedEliminations, getVouchersByAccount,
  DEFAULT_ENTITY_ID, FOREIGN_CURRENCIES,
  type ConsolidatedTrialBalanceRow,
} from '@/services/consolidationService'
import { currencyLabel } from '@/services/exchangeRateService'
import { currentPeriod } from '@/utils/format'
import type { Entity, Voucher } from '@/types/models'

export function ConsolidationReportPage() {
  const { message } = AntdApp.useApp()
  const [entities, setEntities] = useState<Entity[]>([])
  const [period, setPeriod] = useState(currentPeriod())
  const [rateDate, setRateDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [rows, setRows] = useState<ConsolidatedTrialBalanceRow[]>([])
  const [eliminations, setEliminations] = useState<ConsolidatedTrialBalanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()
  const [drill, setDrill] = useState<ConsolidatedTrialBalanceRow | null>(null)
  const [drillVouchers, setDrillVouchers] = useState<Array<{ entityName: string } & Voucher>>([])
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillEntityId, setDrillEntityId] = useState<string | undefined>(undefined)

  const loadEntities = async () => setEntities(await listEntities())
  useEffect(() => { loadEntities() }, [])

  const compute = async () => {
    setLoading(true)
    setRows(await getConsolidatedTrialBalance(period, rateDate))
    setEliminations(await getConsolidatedEliminations(period, rateDate))
    setLoading(false)
  }
  // 期间/汇率/主体变化后重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { compute() }, [period, rateDate, entities.length])

  // 下钻：从合并行穿透到各主体明细凭证
  const openDrill = async (row: ConsolidatedTrialBalanceRow, entityId?: string) => {
    setDrill(row)
    setDrillEntityId(entityId)
    setDrillLoading(true)
    const entityIds = entityId ? [entityId] : Object.keys(row.byEntity)
    const list: Array<{ entityName: string } & Voucher> = []
    for (const eid of entityIds) {
      const vs = await getVouchersByAccount(row.accountCode, period, eid || undefined)
      const name = entities.find((e) => e.id === eid)?.name ?? '总部（人民币账套）'
      vs.forEach((v) => list.push({ entityName: name, ...v }))
    }
    setDrillVouchers(list)
    setDrillLoading(false)
  }

  const submit = async () => {
    const v = await form.validateFields()
    await addEntity({ name: v.name, currency: v.currency })
    message.success('主体已新增')
    setModal(false)
    form.resetFields()
    loadEntities()
  }

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const diff = Math.abs(totalDebit - totalCredit)

  const columns = [
    { title: '科目编码', dataIndex: 'accountCode', width: 120 },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '借方（CNY）', dataIndex: 'debit', align: 'right' as const, render: (v: number) => v.toFixed(2) },
    { title: '贷方（CNY）', dataIndex: 'credit', align: 'right' as const, render: (v: number) => v.toFixed(2) },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_: unknown, row: ConsolidatedTrialBalanceRow) => (
        <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={(e) => { e.stopPropagation(); openDrill(row) }}>
          下钻
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">集团合并报表</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            多账套按其本位币试算平衡，再按所选汇率折算为集团本位币（人民币）后合并；辅助集团层面合并与核对。
          </p>
        </div>
        <Button icon={<PlusOutlined />} onClick={() => setModal(true)}>新增主体</Button>
      </div>

      <Card className="shadow-card">
        <Space wrap>
          <span className="text-[13px] text-ink-600 dark:text-white/70">会计期间</span>
          <DatePicker picker="month" value={dayjs(period + '-01')} onChange={(d) => d && setPeriod((d as Dayjs).format('YYYY-MM'))} />
          <span className="text-[13px] text-ink-600 dark:text-white/70">折算汇率日期</span>
          <DatePicker value={dayjs(rateDate)} onChange={(d) => d && setRateDate((d as Dayjs).format('YYYY-MM-DD'))} />
          <Button type="primary" loading={loading} onClick={compute}>重新计算</Button>
        </Space>
        <div className="mt-3 flex flex-wrap gap-2">
          {entities.length === 0 && <span className="text-[12px] text-ink-400">加载中…</span>}
          {entities.map((e) => (
            <Tag key={e.id} color={e.id === DEFAULT_ENTITY_ID ? 'blue' : 'default'}>
              {e.name} · {currencyLabel(e.currency)}{e.isGroup ? '（集团）' : ''}
            </Tag>
          ))}
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="合并借方" value={totalDebit} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="合并贷方" value={totalCredit} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="借贷差额" value={diff} precision={2} prefix="¥" valueStyle={{ color: diff < 0.005 ? '#0E9F6E' : '#FF4D4F' }} /></Card></Col>
        <Col xs={12} md={6}><Card className="shadow-card"><Statistic title="参与主体数" value={entities.length} /></Card></Col>
      </Row>

      <Card
        className="shadow-card"
        title="集团内部抵销分录（折算至集团本位币 CNY）"
        extra={<span className="text-[12px] text-ink-400">不计入上方合并试算，单独列示内部往来/交易抵销</span>}
      >
        {eliminations.length === 0 ? (
          <Empty description="本期无内部抵销分录" />
        ) : (
          <Table
            rowKey="accountCode"
            pagination={false}
            size="small"
            dataSource={eliminations}
            columns={[
              { title: '科目编码', dataIndex: 'accountCode', width: 120 },
              { title: '科目名称', dataIndex: 'accountName' },
              { title: '借方（CNY）', dataIndex: 'debit', align: 'right' as const, render: (v: number) => v.toFixed(2) },
              { title: '贷方（CNY）', dataIndex: 'credit', align: 'right' as const, render: (v: number) => v.toFixed(2) },
            ]}
          />
        )}
      </Card>

      <Card className="shadow-card" title={`${period} 合并试算平衡表（折算至 ${rateDate}）`}>
        <Table
          rowKey="accountCode"
          columns={columns}
          dataSource={rows}
          pagination={false}
          size="middle"
          onRow={(record) => ({
            onClick: () => openDrill(record),
            style: { cursor: 'pointer' },
          })}
          summary={(page) => {
            let d = 0
            let c = 0
            page.forEach((r) => { d += r.debit; c += r.credit })
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{d.toFixed(2)}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">{c.toFixed(2)}</Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }}
        />
      </Card>

      <Modal title="新增合并主体" open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="name" label="主体 / 账套名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 美国子公司" />
          </Form.Item>
          <Form.Item name="currency" label="记账本位币" rules={[{ required: true, message: '请选择币种' }]}>
            <Select
              options={['CNY', ...FOREIGN_CURRENCIES].map((c) => ({ value: c, label: currencyLabel(c) }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={drill ? `下钻：${drill.accountCode} ${drill.accountName}` : '下钻明细'}
        open={!!drill}
        onCancel={() => setDrill(null)}
        footer={null}
        width={760}
        destroyOnClose
      >
        {drill && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[13px] font-medium text-ink-600 dark:text-white/70">按主体拆分（折算后 CNY）</div>
              <Table
                rowKey={(r) => r[0]}
                pagination={false}
                size="small"
                dataSource={Object.entries(drill.byEntity)}
                columns={[
                  { title: '主体', dataIndex: 0, render: (id: string) => entities.find((e) => e.id === id)?.name ?? '总部（人民币账套）' },
                  { title: '借方', dataIndex: 1, align: 'right' as const, render: (v: { debit: number }) => v.debit.toFixed(2) },
                  { title: '贷方', dataIndex: 1, align: 'right' as const, render: (v: { credit: number }) => v.credit.toFixed(2) },
                ]}
              />
            </div>
            <div>
              <div className="mb-2 text-[13px] font-medium text-ink-600 dark:text-white/70">涉及凭证（共 {drillVouchers.length} 张）</div>
              {drillLoading ? (
                <div className="text-[13px] text-ink-400">加载中…</div>
              ) : drillVouchers.length === 0 ? (
                <Empty description="该科目本期无凭证" />
              ) : (
                <Table
                  rowKey="id"
                  pagination={false}
                  size="small"
                  dataSource={drillVouchers}
                  columns={[
                    { title: '凭证号', dataIndex: 'voucherNo', width: 150 },
                    { title: '日期', dataIndex: 'date', width: 110 },
                    { title: '主体', dataIndex: 'entityName', width: 140 },
                    {
                      title: '本科目金额',
                      key: 'amt',
                      align: 'right' as const,
                      render: (_: unknown, v: Voucher) => {
                        const e = v.entries.find((x) => x.accountCode === drill!.accountCode)
                        return `${((e?.debit || 0).toFixed(2))} / ${((e?.credit || 0).toFixed(2))}`
                      },
                    },
                    { title: '摘要', dataIndex: 'remark', ellipsis: true },
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
