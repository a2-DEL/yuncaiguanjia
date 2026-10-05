import { useEffect, useMemo, useState } from 'react'
import { Card, Select, Button, Table, Tag, Descriptions, Statistic, Space, Alert, App as AntdApp, Popconfirm, Empty, Modal, InputNumber } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, RollbackOutlined, SwapOutlined, LockOutlined, UnlockOutlined, EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { getAvailablePeriods } from '@/services/statementService'
import {
  getClosingInfo,
  carryForwardProfit,
  closePeriod,
  reopenPeriod,
  getClosingOverview,
  isPeriodClosed,
  type CloseInfo,
  type CarryForwardItem,
  type ClosingOverviewRow,
} from '@/services/closingService'
import {
  getOpeningBalance,
  saveManualOpening,
  autoOpenYear,
  isOpeningBalanced,
  type OpeningResult,
} from '@/services/openingService'
import type { OpeningEntry } from '@/types/models'
import { listAccounts } from '@/services/accountService'
import { formatMoney } from '@/utils/format'

const money2 = (v: number) => `¥${formatMoney(v)}`

export function ClosingPage() {
  const { message } = AntdApp.useApp()
  const [periods, setPeriods] = useState<string[]>([])
  const [period, setPeriod] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [info, setInfo] = useState<CloseInfo | null>(null)
  const [overview, setOverview] = useState<ClosingOverviewRow[]>([])
  const [loading, setLoading] = useState(false)

  // 期初余额（开账）
  const currentYear = new Date().getFullYear()
  const [openYear, setOpenYear] = useState<number>(currentYear)
  const [opening, setOpening] = useState<OpeningResult | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editEntries, setEditEntries] = useState<OpeningEntry[]>([])
  const [bsAccounts, setBsAccounts] = useState<{ code: string; name: string }[]>([])
  const [prevDecClosed, setPrevDecClosed] = useState(false)

  const load = async (p: string) => {
    setLoading(true)
    try {
      setInfo(await getClosingInfo(p))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getAvailablePeriods().then((ps) => {
      setPeriods(ps)
      // 默认选最近一个有凭证的期间；若无则保留当前月
      const target = ps.includes(period) ? period : ps[ps.length - 1] ?? period
      setPeriod(target)
      load(target)
    })
    getClosingOverview().then(setOverview)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (period) load(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const isDec = period.endsWith('-12')

  // 可选年份：凭证/结账期间涉及的年份 + 次年（用于开账预览）
  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1])
    periods.forEach((p) => set.add(Number(p.slice(0, 4))))
    overview.forEach((r) => set.add(Number(r.period.slice(0, 4))))
    return Array.from(set)
      .sort()
      .map((y) => ({ value: y, label: `${y} 年` }))
  }, [periods, overview, currentYear])

  const loadOpening = async (y: number) => {
    setOpening(await getOpeningBalance(y))
    setPrevDecClosed(await isPeriodClosed(`${y - 1}-12`))
  }

  useEffect(() => {
    loadOpening(openYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openYear])

  useEffect(() => {
    listAccounts().then((as) =>
      setBsAccounts(as.filter((a) => a.isLeaf && ['asset', 'liability', 'equity'].includes(a.type)).map((a) => ({ code: a.code, name: a.name }))),
    )
  }, [])

  const handleAutoOpen = async () => {
    const prevDec = `${openYear - 1}-12`
    try {
      await autoOpenYear(prevDec)
      await loadOpening(openYear)
      message.success(`已根据 ${prevDec} 结账余额自动生成 ${openYear} 年期初数`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const openManualEdit = () => {
    setEditEntries((opening?.entries ?? []).map((e) => ({ ...e })))
    setEditOpen(true)
  }

  const handleManualSave = async () => {
    if (!isOpeningBalanced(editEntries)) {
      message.error('期初借贷不平衡，无法保存')
      return
    }
    try {
      await saveManualOpening(openYear, editEntries)
      setEditOpen(false)
      await loadOpening(openYear)
      message.success(`已保存 ${openYear} 年期初余额`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const openColumns: ColumnsType<OpeningEntry> = [
    { title: '科目编码', dataIndex: 'accountCode', width: 110 },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '期初借方', dataIndex: 'debit', width: 150, align: 'right', render: (v: number) => (v ? money2(v) : '') },
    { title: '期初贷方', dataIndex: 'credit', width: 150, align: 'right', render: (v: number) => (v ? money2(v) : '') },
  ]



  const columns: ColumnsType<CarryForwardItem> = [
    { title: '科目编码', dataIndex: 'code', width: 120 },
    { title: '科目名称', dataIndex: 'name' },
    {
      title: '类别',
      dataIndex: 'kind',
      width: 100,
      render: (k: string) => (k === 'income' ? <Tag color="green">收入</Tag> : <Tag color="red">费用</Tag>),
    },
    {
      title: '结转余额',
      dataIndex: 'balance',
      width: 160,
      align: 'right',
      render: (v: number) => <span className="tabular-nums">{money2(v)}</span>,
    },
  ]

  const handleCarry = async () => {
    setLoading(true)
    try {
      const r = await carryForwardProfit(period)
      await load(period)
      message.success(r.voucherId ? `损益已结转，生成凭证，净利润 ${money2(r.netProfit)}` : '损益余额为 0，无需结转')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    setLoading(true)
    try {
      await closePeriod(period)
      await load(period)
      message.success(`已成功结账 ${period}` + (isDec ? '（含年末本年利润结转）' : ''))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleReopen = async () => {
    setLoading(true)
    try {
      await reopenPeriod(period)
      await load(period)
      message.success(`已反结账 ${period}`)
    } finally {
      setLoading(false)
    }
  }

  const statusTag = useMemo(() => {
    if (!info) return null
    if (info.isClosed) return <Tag icon={<LockOutlined />} color="success">已结账</Tag>
    if (info.hasCarryForward) return <Tag icon={<CheckCircleOutlined />} color="processing">已结转损益</Tag>
    return <Tag icon={<CloseCircleOutlined />} color="default">未结账</Tag>
  }, [info])

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">期末结账</h2>
            <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
              结转损益到「本年利润」，年末结转「利润分配」，完成月度/年度关账，形成完整财务闭环。
            </p>
          </div>
          <Space wrap>
            <span className="text-[13px] text-ink-500">会计期间</span>
            <Select
              value={period}
              onChange={setPeriod}
              style={{ width: 140 }}
              options={periods.map((p) => ({ value: p, label: p }))}
              placeholder="选择期间"
            />
            {statusTag}
          </Space>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="结账状态" className="lg:col-span-1">
          {info ? (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="会计期间">{info.period}</Descriptions.Item>
              <Descriptions.Item label="损益结转">
                {info.hasCarryForward ? <Tag color="success">已完成</Tag> : <Tag>未结转</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="年末结转">
                {!isDec ? (
                  <Tag>非年末</Tag>
                ) : info.yearEndDone ? (
                  <Tag color="success">已完成</Tag>
                ) : (
                  <Tag>待结转</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="结账状态">
                {info.isClosed ? <Tag color="success">已结账</Tag> : <Tag color="warning">未结账</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="未审核凭证">
                {info.hasUnaudited > 0 ? (
                  <Tag color="error">{info.hasUnaudited} 张（需先审核）</Tag>
                ) : (
                  <Tag color="success">无</Tag>
                )}
              </Descriptions.Item>
              {info.isClosed && (
                <>
                  <Descriptions.Item label="结账人">{info.closedBy}</Descriptions.Item>
                  <Descriptions.Item label="结账时间">
                    {info.closedAt ? new Date(info.closedAt).toLocaleString('zh-CN') : '--'}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
          ) : (
            <Empty description="加载中" />
          )}
        </Card>

        <Card
          title="损益结转预览"
          className="lg:col-span-2"
          extra={
            <Statistic
              title="本期净利润"
              value={info?.netProfit ?? 0}
              precision={2}
              valueStyle={{ color: (info?.netProfit ?? 0) >= 0 ? '#0E9F6E' : '#EF4444', fontSize: 18 }}
              prefix="¥"
            />
          }
        >
          {info && info.profitItems.length > 0 ? (
            <Table<CarryForwardItem>
              rowKey="code"
              size="small"
              columns={columns}
              dataSource={info.profitItems}
              pagination={false}
              scroll={{ y: 280 }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}>
                      <strong>合计（净损益）</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong className="tabular-nums">{money2(info.netProfit)}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="当前期间损益科目余额均为 0"
              description="无需结转损益，可直接结账。"
            />
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="primary"
              icon={<SwapOutlined />}
              loading={loading}
              disabled={info?.hasCarryForward || info?.isClosed}
              onClick={handleCarry}
            >
              结转损益
            </Button>
            <Popconfirm
              title={`确认结账 ${period}？`}
              description={
                info?.hasUnaudited
                  ? `本期还有 ${info.hasUnaudited} 张未审核凭证，无法结账。`
                  : info?.prevUnclosed
                    ? `请先结账上一期 ${info.prevUnclosed}，禁止跳期结账。`
                    : isDec
                      ? '将自动结转损益，并在年末将本年利润转入利润分配。'
                      : '将自动结转损益后标记已结账。'
              }
              okText="确认结账"
              cancelText="取消"
              onConfirm={info?.hasUnaudited || info?.prevUnclosed ? undefined : handleClose}
              disabled={info?.isClosed || info?.hasUnaudited || !!info?.prevUnclosed ? true : false}
            >
              <Button type="primary" danger icon={<LockOutlined />} loading={loading} disabled={info?.isClosed || !!info?.hasUnaudited || !!info?.prevUnclosed}>
                期末结账
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`确认反结账 ${period}？`}
              description="仅解除结账标记，已生成的结转凭证保留，可重新结账。"
              okText="确认反结账"
              cancelText="取消"
              onConfirm={handleReopen}
            >
              <Button icon={<UnlockOutlined />} loading={loading} disabled={!info?.isClosed}>
                反结账
              </Button>
            </Popconfirm>
          </div>
          {info?.hasUnaudited ? (
            <Alert className="mt-3" type="warning" showIcon message={`本期存在 ${info.hasUnaudited} 张未审核凭证，请先到凭证管理完成审核再结账。`} />
          ) : null}
          {info?.prevUnclosed ? (
            <Alert className="mt-3" type="warning" showIcon message={`上一期 ${info.prevUnclosed} 尚未结账，禁止跳期结账。请按会计期间顺序依次完成关账。`} />
          ) : null}
          {info?.hasCarryForward && !info?.isClosed ? (
            <Alert className="mt-3" type="success" showIcon message="损益已结转，可继续期末结账（年末将自动结转本年利润）。" />
          ) : null}
        </Card>
      </div>

      <Card
        title="期初余额（开账）"
        className="shadow-card"
        extra={
          <Space>
            <span className="text-[13px] text-ink-500">年度</span>
            <Select value={openYear} onChange={setOpenYear} style={{ width: 120 }} options={yearOptions} />
          </Space>
        }
      >
        <Space wrap className="mb-3">
          {opening?.source === 'auto' ? (
            <Tag color="success" icon={<KeyOutlined />}>自动开账（源自 {opening.basedOnPeriod} 结账）</Tag>
          ) : opening?.source === 'manual' ? (
            <Tag color="blue" icon={<EditOutlined />}>手工录入</Tag>
          ) : (
            <Tag>派生（取自 {opening?.basedOnPeriod ?? '上年12月'} 结账余额）</Tag>
          )}
          {prevDecClosed ? (
            <Button type="primary" icon={<KeyOutlined />} onClick={handleAutoOpen}>
              自动开账（{openYear - 1} 年结账驱动）
            </Button>
          ) : (
            <Button icon={<KeyOutlined />} onClick={handleAutoOpen} disabled>
              自动开账（需先结账 {openYear - 1}-12）
            </Button>
          )}
          <Button icon={<EditOutlined />} onClick={openManualEdit}>
            手工录入
          </Button>
        </Space>

        {opening && opening.entries.length > 0 ? (
          <Table<OpeningEntry>
            rowKey="accountCode"
            size="small"
            dataSource={opening.entries}
            columns={openColumns}
            pagination={false}
            scroll={{ y: 300 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <strong>合计</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong className="tabular-nums">{money2(opening.entries.reduce((s, e) => s + e.debit, 0))}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <strong className="tabular-nums">{money2(opening.entries.reduce((s, e) => s + e.credit, 0))}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        ) : (
          <Alert type="info" showIcon message="该年度暂无期初余额" description="年末结账后会自动驱动下年期初；或点击「手工录入」设置新账套启用时的期初余额。" />
        )}
        <Alert
          className="mt-3"
          type="info"
          showIcon
          message="自动开账不重复记账"
          description="资产负债表期初优先采用此处期初数，并扣除历史年度余额后叠加本年发生额，确保资产=负债+权益始终平衡，不会产生重复计算。"
        />
      </Card>

      <Card title="结账进度总览" className="shadow-card">
        <Table<ClosingOverviewRow>
          rowKey="period"
          size="small"
          dataSource={overview}
          pagination={false}
          columns={[
            { title: '会计期间', dataIndex: 'period', width: 130 },
            {
              title: '损益结转',
              dataIndex: 'hasCarryForward',
              width: 110,
              render: (v: boolean) => (v ? <Tag color="success">已完成</Tag> : <Tag>未结转</Tag>),
            },
            {
              title: '年末结转',
              dataIndex: 'yearEndDone',
              width: 110,
              render: (v: boolean, r) =>
                !r.period.endsWith('-12') ? <Tag>非年末</Tag> : v ? <Tag color="success">已完成</Tag> : <Tag>待结转</Tag>,
            },
            {
              title: '结账状态',
              dataIndex: 'isClosed',
              width: 110,
              render: (v: boolean) => (v ? <Tag color="success">已结账</Tag> : <Tag color="warning">未结账</Tag>),
            },
            { title: '结账人', dataIndex: 'closedBy', width: 100, render: (v?: string) => v ?? '--' },
            {
              title: '结账时间',
              dataIndex: 'closedAt',
              render: (v?: number) => (v ? new Date(v).toLocaleString('zh-CN') : '--'),
            },
            {
              title: '操作',
              key: 'op',
              width: 120,
              fixed: 'right',
              render: (_, r) => (
                <Button type="link" size="small" onClick={() => { setPeriod(r.period); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                  定位处理
                </Button>
              ),
            },
          ]}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={`手工录入 ${openYear} 年期初余额`}
        open={editOpen}
        onOk={handleManualSave}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          message="期初借方合计须等于贷方合计，否则无法保存。"
        />
        <Table<OpeningEntry>
          rowKey={(r, i) => `${r.accountCode}-${i}`}
          size="small"
          pagination={false}
          dataSource={editEntries}
          columns={[
            {
              title: '科目',
              dataIndex: 'accountCode',
              render: (code: string, _r, i) => (
                <Select
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 240 }}
                  value={code || undefined}
                  placeholder="选择科目"
                  options={bsAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))}
                  onChange={(v) => {
                    const name = bsAccounts.find((a) => a.code === v)?.name ?? ''
                    setEditEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, accountCode: v, accountName: name } : e)))
                  }}
                />
              ),
            },
            {
              title: '期初借方',
              dataIndex: 'debit',
              width: 150,
              render: (v: number, _r, i) => (
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  value={v}
                  onChange={(val) =>
                    setEditEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, debit: Number(val) || 0 } : e)))
                  }
                />
              ),
            },
            {
              title: '期初贷方',
              dataIndex: 'credit',
              width: 150,
              render: (v: number, _r, i) => (
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  value={v}
                  onChange={(val) =>
                    setEditEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, credit: Number(val) || 0 } : e)))
                  }
                />
              ),
            },
            {
              title: '操作',
              width: 60,
              render: (_v, _r, i) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setEditEntries((prev) => prev.filter((_, idx) => idx !== i))} />
              ),
            },
          ]}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong className="tabular-nums">{money2(editEntries.reduce((s, e) => s + e.debit, 0))}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong className={isOpeningBalanced(editEntries) ? 'tabular-nums' : 'tabular-nums text-red-500'}>
                    {money2(editEntries.reduce((s, e) => s + e.credit, 0))}
                  </strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
        <Button
          className="mt-3"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setEditEntries((prev) => [...prev, { accountCode: '', accountName: '', debit: 0, credit: 0 }])}
        >
          添加一行
        </Button>
      </Modal>
    </div>
  )
}
