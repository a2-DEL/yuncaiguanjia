import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tabs, Select, Button, Space, Tag, Table, message, Spin, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PrinterOutlined, DownloadOutlined, FileTextOutlined, FundOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons'
import {
  getBalanceSheet, getProfitStatement, getCashFlowStatement, getAvailablePeriods,
  type BalanceSheet, type BsRow, type ProfitStatement, type PlRow, type CashFlowStatement, type CashFlowRow, type CashFlowVoucherRef,
} from '@/services/statementService'
import { currentPeriod } from '@/utils/format'
import { formatMoney } from '@/utils/format'
import { VoucherDrillDrawer } from '@/components/VoucherDrillDrawer'

type TabKey = 'balance' | 'profit' | 'cashflow'

const money = (v: number) => <span className="tabular-nums">{formatMoney(v)}</span>

function downloadCsv(name: string, lines: (string | number)[][]) {
  const csv = '﻿' + lines.map((r) => r.map((c) => `"${c ?? ''}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportCenterPage() {
  const [tab, setTab] = useState<TabKey>('balance')
  const [period, setPeriod] = useState(currentPeriod())
  const [periods, setPeriods] = useState<string[]>([])
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [pl, setPl] = useState<ProfitStatement | null>(null)
  const [cf, setCf] = useState<CashFlowStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [flowDrawer, setFlowDrawer] = useState<{ title: string; vouchers: CashFlowVoucherRef[] } | null>(null)
  const [plDrawer, setPlDrawer] = useState<{ title: string; vouchers: CashFlowVoucherRef[] } | null>(null)

  useEffect(() => {
    getAvailablePeriods().then((p) => {
      setPeriods(p)
      if (p.length && !p.includes(period)) setPeriod(period.localeCompare(p[p.length - 1]) > 0 ? p[p.length - 1] : period)
    })
  }, [])

  useEffect(() => {
    if (!periods.length) return
    setLoading(true)
    const run = async () => {
      try {
        if (tab === 'balance') setBs(await getBalanceSheet(period))
        else if (tab === 'profit') setPl(await getProfitStatement(period))
        else setCf(await getCashFlowStatement(period))
      } catch (e) {
        message.error('报表生成失败：' + (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [tab, period, periods.length])

  const title = useMemo(() => {
    if (tab === 'balance') return `资产负债表（${period}）`
    if (tab === 'profit') return `利润表（${period}）`
    return `现金流量表（${period}）`
  }, [tab, period])

  const handlePrint = () => window.print()
  const handleExport = () => {
    if (tab === 'balance' && bs) {
      const header = ['资产', '年初余额', '期末余额', '', '负债和所有者权益', '年初余额', '期末余额']
      const lines: (string | number)[][] = [header]
      const n = Math.max(bs.assets.length, bs.liabilities.length)
      for (let i = 0; i < n; i++) {
        const a = bs.assets[i]
        const l = bs.liabilities[i]
        lines.push([
          a?.item ?? '', a ? formatMoney(a.opening) : '', a ? formatMoney(a.closing) : '',
          '',
          l?.item ?? '', l ? formatMoney(l.opening) : '', l ? formatMoney(l.closing) : '',
        ])
      }
      downloadCsv(`资产负债表_${period}.csv`, lines)
    } else if (tab === 'profit' && pl) {
      const lines: (string | number)[][] = [['项目', '本月金额', '本年累计']]
      pl.rows.forEach((r) => lines.push([r.item, formatMoney(r.month), formatMoney(r.ytd)]))
      downloadCsv(`利润表_${period}.csv`, lines)
    } else if (tab === 'cashflow' && cf) {
      const lines: (string | number)[][] = [['项目', '本月金额', '本年累计']]
      cf.rows.forEach((r) => lines.push([r.item, formatMoney(r.month), formatMoney(r.ytd)]))
      downloadCsv(`现金流量表_${period}.csv`, lines)
    }
  }

  // 资产负债表两栏对照
  const bsColumns: ColumnsType<{ a?: BsRow; l?: BsRow }> = [
    { title: '资产', dataIndex: 'aItem', width: '22%', render: (_, r) => (
      <span style={{ fontWeight: r.a?.bold ? 700 : 400, paddingLeft: r.a?.indent ? 16 : 0 }}>{r.a?.item ?? ''}</span>
    ) },
    { title: '年初余额', dataIndex: 'aOpen', align: 'right', width: '13%', render: (_, r) => r.a ? money(r.a.opening) : '' },
    { title: '期末余额', dataIndex: 'aClose', align: 'right', width: '13%', render: (_, r) => r.a ? money(r.a.closing) : '' },
    { title: '', width: 24, render: () => '' },
    { title: '负债和所有者权益', dataIndex: 'lItem', width: '22%', render: (_, r) => (
      <span style={{ fontWeight: r.l?.bold ? 700 : 400, paddingLeft: r.l?.indent ? 16 : 0 }}>{r.l?.item ?? ''}</span>
    ) },
    { title: '年初余额', dataIndex: 'lOpen', align: 'right', width: '13%', render: (_, r) => r.l ? money(r.l.opening) : '' },
    { title: '期末余额', dataIndex: 'lClose', align: 'right', width: '13%', render: (_, r) => r.l ? money(r.l.closing) : '' },
  ]
  const bsData = useMemo(() => {
    if (!bs) return []
    const n = Math.max(bs.assets.length, bs.liabilities.length)
    return Array.from({ length: n }, (_, i) => ({ key: i, a: bs.assets[i], l: bs.liabilities[i] }))
  }, [bs])

  const plColumns: ColumnsType<PlRow> = [
    { title: '项目', dataIndex: 'item', render: (_, r) => <span style={{ fontWeight: r.bold ? 700 : 400, paddingLeft: r.indent ? 16 : 0 }}>{r.item}</span> },
    { title: '本月金额', dataIndex: 'month', align: 'right', render: (v: number) => money(v) },
    { title: '本年累计', dataIndex: 'ytd', align: 'right', render: (v: number) => money(v) },
  ]
  const cfColumns: ColumnsType<CashFlowRow> = [
    { title: '项目', dataIndex: 'item', render: (_, r) => <span style={{ fontWeight: r.bold ? 700 : 400, paddingLeft: r.indent ? 16 : 0 }}>{r.item}</span> },
    { title: '本月金额', dataIndex: 'month', align: 'right', render: (v: number) => money(v) },
    { title: '本年累计', dataIndex: 'ytd', align: 'right', render: (v: number) => money(v) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 打印样式：仅显示报表区域 */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-print, #report-print * { visibility: visible !important; }
          #report-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        .cashflow-drill:hover > td { background: rgba(27,95,227,0.06) !important; }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            <FundOutlined style={{ color: '#1B5FE3', marginRight: 8 }} />报表中心
          </h2>
          <div style={{ color: '#8a8f99', fontSize: 13, marginTop: 4 }}>
            基于已审核凭证实时聚合 · 自动平衡校验
          </div>
        </div>
        <Space>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 140 }}
            options={periods.map((p) => ({ value: p, label: p }))}
            placeholder="选择期间"
          />
          <Tooltip title="打印当前报表"><Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button></Tooltip>
          <Tooltip title="导出为 CSV"><Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button></Tooltip>
        </Space>
      </div>

      <div id="report-print">
        <Card
          size="small"
          styles={{ body: { padding: 0 } }}
          title={
            <Space>
              <FileTextOutlined style={{ color: '#1B5FE3' }} />
              <span style={{ fontWeight: 700 }}>{title}</span>
              {tab === 'balance' && bs && (
                <Tag color={bs.balanced ? 'success' : 'error'}>
                  {bs.balanced ? '借贷平衡 ✓' : '不平衡 ✗'}
                </Tag>
              )}
            </Space>
          }
        >
          <Spin spinning={loading}>
            <Tabs
              className="no-print"
              activeKey={tab}
              onChange={(k) => setTab(k as TabKey)}
              items={[
                { key: 'balance', label: '资产负债表' },
                { key: 'profit', label: '利润表' },
                { key: 'cashflow', label: '现金流量表' },
              ]}
              style={{ padding: '0 16px' }}
            />

            {tab === 'balance' && bs && (
              <Table
                bordered size="small" pagination={false} columns={bsColumns} dataSource={bsData}
                style={{ padding: 16 }}
                rowClassName={(_, i) => (i % 2 ? 'row-stripe' : '')}
              />
            )}
            {tab === 'profit' && pl && (
              <>
                <div className="no-print px-4 pt-2 text-[12px] text-ink-500 dark:text-white/50">
                  点击带科目的项目行可下钻查看来源凭证 →
                </div>
                <Table bordered size="small" pagination={false} columns={plColumns} dataSource={pl.rows} style={{ padding: 16 }}
                  rowClassName={(r) => (r.accounts ? 'cashflow-drill cursor-pointer' : '')}
                  onRow={(r) => ({ onClick: () => r.accounts && setPlDrawer({ title: r.item, vouchers: r.vouchers ?? [] }) })}
                />
              </>
            )}
            {tab === 'cashflow' && cf && (
              <>
                <div className="no-print px-4 pt-2 text-[12px] text-ink-500 dark:text-white/50">
                  点击项目行可下钻查看来源凭证 →
                </div>
                <Table bordered size="small" pagination={false} columns={cfColumns} dataSource={cf.rows} style={{ padding: 16 }}
                  rowClassName={(r) => (r.project ? 'cashflow-drill cursor-pointer' : '')}
                  onRow={(r) => ({ onClick: () => r.project && setFlowDrawer({ title: r.item, vouchers: r.vouchers ?? [] }) })}
                />
              </>
            )}

            {tab === 'balance' && bs && (
              <div style={{ padding: '8px 16px 16px', color: '#8a8f99', fontSize: 12 }} className="no-print">
                资产总计 {money(bs.assetTotal)} ＝ 负债合计 {money(bs.liabilityTotal)} ＋ 所有者权益合计 {money(bs.equityTotal)}
              </div>
            )}
            {tab === 'cashflow' && cf && (
              <div style={{ padding: '8px 16px 16px', color: '#8a8f99', fontSize: 12 }} className="no-print">
                现金及现金等价物净增加额（本月）：
                <span style={{ color: cf.netIncrease >= 0 ? '#0E9F6E' : '#E5484D', marginLeft: 6 }}>
                  {cf.netIncrease >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {money(cf.netIncrease)}
                </span>
              </div>
            )}
          </Spin>
        </Card>
      </div>

      <VoucherDrillDrawer title={flowDrawer?.title ?? ''} vouchers={flowDrawer?.vouchers ?? []} open={!!flowDrawer} onClose={() => setFlowDrawer(null)} />
      <VoucherDrillDrawer title={plDrawer?.title ?? ''} vouchers={plDrawer?.vouchers ?? []} open={!!plDrawer} onClose={() => setPlDrawer(null)} />
    </div>
  )
}
