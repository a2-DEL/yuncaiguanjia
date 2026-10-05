import { useEffect, useMemo, useState } from 'react'
import { Card, Tabs, Select, Table, Spin, Space, Tag, Empty, Button, Modal, message, DatePicker, Switch } from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { BookOutlined, FundOutlined, SwapOutlined } from '@ant-design/icons'
import {
  getGeneralLedger, getDetailLedger, getAccountVouchers, getForeignBalance, getAvailablePeriods,
  previewExchangeAdjustment, generateExchangeAdjustment,
  type GeneralLedgerRow, type DetailLedger, type ForeignBalanceRow, type ExchangeAdjustmentLine,
} from '@/services/ledgerService'
import { listAccounts } from '@/services/accountService'
import { currentPeriod, formatMoney } from '@/utils/format'
import { currencyLabel } from '@/services/exchangeRateService'
import { useNavigate } from 'react-router-dom'
import { VoucherDrillDrawer } from '@/components/VoucherDrillDrawer'
import type { CashFlowVoucherRef } from '@/services/statementService'
import type { Account } from '@/types/models'

type TabKey = 'general' | 'detail' | 'foreign'

const money = (v: number) => <span className="tabular-nums">{formatMoney(v)}</span>
const balText = (dir: '借' | '贷', amount: number) => (
  <span className="tabular-nums">{dir} {formatMoney(amount)}</span>
)

export function LedgerPage() {
  const [tab, setTab] = useState<TabKey>('general')
  const [period, setPeriod] = useState(currentPeriod())
  const [periods, setPeriods] = useState<string[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountCode, setAccountCode] = useState('1002')
  const [gl, setGl] = useState<GeneralLedgerRow[]>([])
  const [detail, setDetail] = useState<DetailLedger | null>(null)
  const [loading, setLoading] = useState(false)
  const [glDrawer, setGlDrawer] = useState<{ title: string; vouchers: CashFlowVoucherRef[] } | null>(null)
  const [fb, setFb] = useState<ForeignBalanceRow[]>([])
  const [adjLines, setAdjLines] = useState<ExchangeAdjustmentLine[] | null>(null)
  const [adjDate, setAdjDate] = useState<string>('')
  const [adjAutoAudit, setAdjAutoAudit] = useState(true)
  const [adjLoading, setAdjLoading] = useState(false)
  const navigate = useNavigate()

  /** 期间月末日期 YYYY-MM-DD */
  const monthEnd = (p: string) => {
    const [y, m] = p.split('-').map(Number)
    const d = new Date(y, m, 0).getDate()
    return `${p}-${String(d).padStart(2, '0')}`
  }

  /** 预览期末调汇差异（按指定汇率日期） */
  const previewAdjust = async (rateDate: string) => {
    setAdjLoading(true)
    try {
      const lines = await previewExchangeAdjustment(period, rateDate)
      if (lines.length === 0) {
        message.info('当前所选汇率日期下无需要调整的外币余额（汇率与账面一致或余额为零）')
        setAdjLines([])
        return
      }
      setAdjLines(lines)
    } catch (e) {
      message.error((e as Error).message || '计算调汇失败')
    } finally {
      setAdjLoading(false)
    }
  }

  const openAdjustment = () => {
    const def = monthEnd(period)
    setAdjDate(def)
    previewAdjust(def)
  }

  const changeAdjDate = (d: dayjs.Dayjs | null) => {
    const ds = d ? d.format('YYYY-MM-DD') : ''
    setAdjDate(ds)
    if (ds) previewAdjust(ds)
  }

  /** 确认生成期末调汇凭证（按开关决定是否自动审核入账） */
  const confirmAdjustment = async () => {
    setAdjLoading(true)
    try {
      const res = await generateExchangeAdjustment(period, { rateDate: adjDate || monthEnd(period), autoAudit: adjAutoAudit })
      if (res.audited) {
        message.success(`已生成并审核入账期末调汇凭证 ${res.voucherNo}`)
      } else {
        message.success(`已生成期末调汇凭证 ${res.voucherNo}（草稿），请审核后入账`)
      }
      setAdjLines(null)
      await loadData()
      if (!res.audited) navigate(`/voucher/edit/${res.voucherId}`)
    } catch (e) {
      message.error((e as Error).message || '生成调汇凭证失败')
    } finally {
      setAdjLoading(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (tab === 'general') setGl(await getGeneralLedger(period))
      else if (tab === 'detail') setDetail(await getDetailLedger(accountCode, period))
      else setFb(await getForeignBalance(period))
    } catch (e) {
      // 忽略
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getAvailablePeriods().then((p) => {
      setPeriods(p)
      if (p.length && !p.includes(period)) setPeriod(p[p.length - 1])
    })
    listAccounts().then((a) => {
      const sorted = [...a].sort((x, y) => x.code.localeCompare(y.code))
      setAccounts(sorted)
      if (!sorted.find((s) => s.code === accountCode) && sorted[0]) setAccountCode(sorted[0].code)
    })
  }, [])

  useEffect(() => {
    if (!periods.length) return
    setLoading(true)
    const run = async () => {
      try {
        if (tab === 'general') setGl(await getGeneralLedger(period))
        else if (tab === 'detail') setDetail(await getDetailLedger(accountCode, period))
        else setFb(await getForeignBalance(period))
      } catch (e) {
        // 忽略
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [tab, period, accountCode, periods.length])

  const glColumns: ColumnsType<GeneralLedgerRow> = [
    { title: '科目编码', dataIndex: 'code', width: 110, render: (v) => <span className="tabular-nums">{v}</span> },
    { title: '科目名称', dataIndex: 'name' },
    { title: '期初余额', width: 150, align: 'right', render: (_, r) => balText(r.openingDir, r.opening) },
    { title: '本期借方', dataIndex: 'periodDebit', width: 140, align: 'right', render: (v: number) => money(v) },
    { title: '本期贷方', dataIndex: 'periodCredit', width: 140, align: 'right', render: (v: number) => money(v) },
    { title: '期末余额', width: 150, align: 'right', render: (_, r) => balText(r.closingDir, r.closing) },
  ]

  const fbColumns: ColumnsType<ForeignBalanceRow> = [
    { title: '科目编码', dataIndex: 'code', width: 100, render: (v) => <span className="tabular-nums">{v}</span> },
    { title: '科目名称', dataIndex: 'name' },
    { title: '币种', dataIndex: 'currency', width: 90, render: (c) => <Tag color="purple">{currencyLabel(c)}</Tag> },
    { title: '期初原币', dataIndex: 'openingForeign', width: 120, align: 'right', render: (v) => money(v) },
    { title: '期初本位币', dataIndex: 'openingBase', width: 120, align: 'right', render: (v) => money(v) },
    { title: '本期借(原币)', dataIndex: 'periodDebitForeign', width: 120, align: 'right', render: (v) => money(v) },
    { title: '本期贷(原币)', dataIndex: 'periodCreditForeign', width: 120, align: 'right', render: (v) => money(v) },
    { title: '期末原币', dataIndex: 'closingForeign', width: 120, align: 'right', render: (v) => money(v) },
    { title: '期末本位币', dataIndex: 'closingBase', width: 120, align: 'right', render: (v) => money(v) },
    { title: '汇率', dataIndex: 'rate', width: 90, align: 'right', render: (v: number) => <span className="tabular-nums">{v?.toFixed(4)}</span> },
  ]

  const detailColumns: ColumnsType<DetailLedger['rows'][number]> = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '凭证字号', dataIndex: 'voucherNo', width: 140 },
    { title: '摘要', dataIndex: 'summary' },
    { title: '借方', dataIndex: 'debit', width: 130, align: 'right', render: (v: number) => money(v) },
    { title: '贷方', dataIndex: 'credit', width: 130, align: 'right', render: (v: number) => money(v) },
    { title: '方向', dataIndex: 'balanceDir', width: 60, align: 'center', render: (v: string) => <Tag color={v === '借' ? 'blue' : 'green'}>{v}</Tag> },
    { title: '余额', dataIndex: 'balance', width: 130, align: 'right', render: (v: number) => money(v) },
  ]

  const title = useMemo(
    () => (tab === 'general' ? `总分类账（${period}）` : `明细账 · ${detail?.account.code} ${detail?.account.name}（${period}）`),
    [tab, period, detail],
  )

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            <BookOutlined style={{ color: '#1B5FE3', marginRight: 8 }} />账簿查询
          </h2>
          <div style={{ color: '#8a8f99', fontSize: 13, marginTop: 4 }}>
            基于已审核凭证实时登记 · 凭证 → 账簿 → 报表完整闭环
          </div>
        </div>
        <Space wrap>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 140 }}
            options={periods.map((p) => ({ value: p, label: p }))}
            placeholder="选择期间"
          />
          {tab === 'detail' && (
            <Select
              value={accountCode}
              onChange={setAccountCode}
              showSearch
              style={{ width: 260 }}
              optionFilterProp="label"
              options={accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))}
              placeholder="选择科目"
            />
          )}
        </Space>
      </div>

      <Card size="small" styles={{ body: { padding: 0 } }} title={<span style={{ fontWeight: 700 }}><FundOutlined style={{ color: '#1B5FE3', marginRight: 6 }} />{title}</span>}>
        <Spin spinning={loading}>
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={[
              { key: 'general', label: '总分类账' },
              { key: 'detail', label: '明细账' },
              { key: 'foreign', label: '外币余额表' },
            ]}
            style={{ padding: '0 16px' }}
          />

          {tab === 'general' && (
            <>
              <div style={{ padding: '12px 16px 0', fontSize: 13, color: '#5b5f66' }}>
                点击科目行可下钻查看本期来源凭证 →
              </div>
              <Table bordered size="small" pagination={{ pageSize: 20, showSizeChanger: false }} columns={glColumns} dataSource={gl} rowKey="code" style={{ padding: 16 }}
                rowClassName={() => 'cursor-pointer'}
                onRow={(r) => ({
                  onClick: async () => {
                    const vouchers = await getAccountVouchers(r.code, period)
                    setGlDrawer({ title: `${r.code} ${r.name}`, vouchers })
                  },
                })}
              />
            </>
          )}

          {tab === 'detail' && detail && (
            <>
              <div style={{ padding: '12px 16px 0', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#5b5f66' }} className="tabular-nums">
                <span>期初余额：<b>{detail.openingDir} {formatMoney(detail.opening)}</b></span>
                <span>本期借方合计：<b>{formatMoney(detail.periodDebit)}</b></span>
                <span>本期贷方合计：<b>{formatMoney(detail.periodCredit)}</b></span>
                <span>期末余额：<b>{detail.closingDir} {formatMoney(detail.closing)}</b></span>
              </div>
              <Table bordered size="small" pagination={{ pageSize: 30, showSizeChanger: false }} columns={detailColumns} dataSource={detail.rows} rowKey={(_, i) => String(i)} style={{ padding: 16 }}
                rowClassName={() => 'cursor-pointer'}
                onRow={(r) => ({ onClick: () => navigate(`/voucher/edit/${r.id}`) })}
              />
            </>
          )}

          {tab === 'foreign' && (
            fb.length === 0 ? (
              <Empty style={{ padding: 40 }} description="暂无外币核算科目（可在「会计科目」中为科目设置币种）" />
            ) : (
              <>
                <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" ghost icon={<SwapOutlined />} loading={adjLoading} onClick={openAdjustment}>
                    生成期末调汇凭证
                  </Button>
                </div>
                <Table bordered size="small" pagination={{ pageSize: 30, showSizeChanger: false }} columns={fbColumns} dataSource={fb} rowKey="code" style={{ padding: 16 }} />
              </>
            )
          )}

          <Modal
            title={`期末调汇预览（${period}）`}
            open={!!adjLines}
            onCancel={() => !adjLoading && setAdjLines(null)}
            onOk={confirmAdjustment}
            okText={adjAutoAudit ? '生成并审核入账' : '生成草稿凭证'}
            okButtonProps={{ disabled: !!adjLines && adjLines.length === 0 }}
            confirmLoading={adjLoading}
            width={720}
            maskClosable={false}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#5b5f66', fontSize: 13 }}>调汇汇率日期：</span>
              <DatePicker
                value={adjDate ? dayjs(adjDate) : null}
                onChange={changeAdjDate}
                allowClear={false}
                disabledDate={(d) => d && d.format('YYYY-MM') !== period}
              />
              <span style={{ color: '#8a8f99', fontSize: 12 }}>默认期间月末；仅可选本期间内的日期</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Switch checked={adjAutoAudit} onChange={setAdjAutoAudit} />
              <span style={{ color: '#5b5f66', fontSize: 13 }}>生成后自动审核入账</span>
              <span style={{ color: '#8a8f99', fontSize: 12 }}>（关闭则生成草稿，需到凭证列表手动审核）</span>
            </div>
            <p style={{ color: '#8a8f99', fontSize: 13, marginTop: 0 }}>
              按所选汇率重算各外币科目本位币，差额计入「财务费用-汇兑损益」。确认后生成凭证（正数=调增本位币，负数=调减）：
            </p>
            <Table
              size="small"
              pagination={false}
              rowKey="code"
              dataSource={adjLines ?? []}
              locale={{ emptyText: '当前汇率日期下无需调整' }}
              columns={[
                { title: '科目', dataIndex: 'name', render: (_, r) => `${r.code} ${r.name}` },
                { title: '币种', dataIndex: 'currency', width: 80, render: (c) => <Tag color="purple">{currencyLabel(c)}</Tag> },
                { title: '期末原币', dataIndex: 'closingForeign', width: 110, align: 'right', render: (v) => money(v) },
                { title: '期末汇率', dataIndex: 'rate', width: 90, align: 'right', render: (v: number) => v?.toFixed(4) },
                { title: '账面本位币', dataIndex: 'oldBase', width: 110, align: 'right', render: (v) => money(v) },
                { title: '调整后本位币', dataIndex: 'newBase', width: 110, align: 'right', render: (v) => money(v) },
                { title: '调整额', dataIndex: 'adjustment', width: 110, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>{money(v)}</span> },
              ]}
            />
          </Modal>

        </Spin>
      </Card>

      <VoucherDrillDrawer title={glDrawer?.title ?? ''} vouchers={glDrawer?.vouchers ?? []} open={!!glDrawer} onClose={() => setGlDrawer(null)} />
    </div>
  )
}
