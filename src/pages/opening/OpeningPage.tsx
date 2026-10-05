import { useEffect, useMemo, useState } from 'react'
import {
  Card, Table, Button, InputNumber, Select, Tag, App as AntdApp, Space, Alert,
} from 'antd'
import { SaveOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons'
import { getOpeningBalance, saveManualOpening, deleteOpening, isOpeningBalanced } from '@/services/openingService'
import { listAccounts } from '@/services/accountService'
import { usePermission } from '@/hooks/usePermission'
import type { Account, OpeningEntry } from '@/types/models'
import { money } from '@/utils/format'

interface Row extends OpeningEntry {}

const SOURCE_LABEL: Record<string, string> = {
  auto: '年末结账自动生成',
  manual: '手工录入',
  derived: '由上年结账余额派生',
}

export function OpeningPage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const canManage = can('opening:manage')

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [rows, setRows] = useState<Row[]>([])
  const [source, setSource] = useState<string>('')
  const [basedOn, setBasedOn] = useState<string | undefined>()

  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1], [currentYear])

  const load = async () => {
    const [bal, accs] = await Promise.all([getOpeningBalance(year), listAccounts()])
    const bs = accs.filter((a: Account) => a.isLeaf && (a.type === 'asset' || a.type === 'liability' || a.type === 'equity'))
    const map = new Map(bal.entries.map((e) => [e.accountCode, e]))
    setRows(
      bs.map((a) => {
        const e = map.get(a.code)
        return { accountCode: a.code, accountName: a.name, debit: e?.debit ?? 0, credit: e?.credit ?? 0 }
      }),
    )
    setSource(bal.source)
    setBasedOn(bal.basedOnPeriod)
  }

  useEffect(() => { load() }, [year])

  const setCell = (code: string, field: 'debit' | 'credit', val: number | null) => {
    setRows((rs) => rs.map((r) => (r.accountCode === code ? { ...r, [field]: val ?? 0 } : r)))
  }

  const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (r.credit || 0), 0)
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100
  const balanced = isOpeningBalanced(rows)

  const save = async () => {
    const entries = rows.filter((r) => (r.debit || 0) > 0 || (r.credit || 0) > 0)
    if (!isOpeningBalanced(entries)) {
      message.error(`期初余额借贷不平衡（差额 ${money(Math.abs(diff))}），无法保存`)
      return
    }
    await saveManualOpening(year, entries)
    message.success(`${year} 年期初余额已保存`); load()
  }

  const clear = async () => {
    await deleteOpening(year)
    message.success('已清空，恢复为派生/空'); load()
  }

  const columns = [
    { title: '科目编码', dataIndex: 'accountCode', width: 110, render: (v: string) => <span className="tabular-nums font-medium">{v}</span> },
    { title: '科目名称', dataIndex: 'accountName', width: 200 },
    { title: '借方期初', dataIndex: 'debit', width: 180, render: (_: any, r: Row) => (
      <InputNumber min={0} precision={2} prefix="¥" className="w-full" value={r.debit} disabled={!canManage}
        onChange={(v) => setCell(r.accountCode, 'debit', v)} />
    ) },
    { title: '贷方期初', dataIndex: 'credit', width: 180, render: (_: any, r: Row) => (
      <InputNumber min={0} precision={2} prefix="¥" className="w-full" value={r.credit} disabled={!canManage}
        onChange={(v) => setCell(r.accountCode, 'credit', v)} />
    ) },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">初始化 / 开账</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            录入新账套各资产/负债/权益科目的期初余额，作为资产负债表与后续账务的起点。必须先借贷平衡。
          </p>
        </div>
        <Space>
          <Select value={year} style={{ width: 120 }} onChange={(v) => setYear(v)}
            options={years.map((y) => ({ value: y, label: `${y} 年` }))} />
          {canManage && (
            <>
              <Button icon={<DeleteOutlined />} onClick={clear}>清空</Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={save}>保存期初</Button>
            </>
          )}
        </Space>
      </div>

      <Space size={2} wrap>
        <Tag color={source === 'manual' ? 'blue' : source === 'auto' ? 'green' : 'default'}>
          数据来源：{SOURCE_LABEL[source] ?? source}
        </Tag>
        {basedOn && <Tag>基于期间：{basedOn}</Tag>}
      </Space>

      <Alert
        type={balanced ? 'success' : 'warning'}
        showIcon
        icon={<CalculatorOutlined />}
        message={
          <span>
            借方合计 <b className="tabular-nums">{money(totalDebit)}</b> · 贷方合计 <b className="tabular-nums">{money(totalCredit)}</b> ·
            差额 <b className="tabular-nums">{money(Math.abs(diff))}</b>
            {balanced ? '（已平衡）' : '（未平衡，请调整）'}
          </span>
        }
      />

      {!canManage && <Alert type="info" showIcon message="当前账号仅有查看权限（需 opening:manage 方可编辑）。" />}

      <Card className="shadow-card">
        <Table rowKey="accountCode" columns={columns} dataSource={rows} pagination={false} size="middle"
          scroll={{ x: 700 }} />
      </Card>
    </div>
  )
}
