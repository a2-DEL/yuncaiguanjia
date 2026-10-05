import { useEffect, useState } from 'react'
import { Card, Input, Button, Table, Select, Space, Typography, App as AntdApp, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UploadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { parseBankCsv, parseQif, parseOfx, buildVouchersFromRows, type BankStatementRow, type StatementImportOptions } from '@/services/statementImportService'
import { listAccounts } from '@/services/accountService'
import { saveVoucher } from '@/services/voucherService'
import type { Account } from '@/types/models'
import { useUserStore } from '@/store/userStore'
import { formatMoney } from '@/utils/format'

const { Title, Text } = Typography

export function StatementImportPage() {
  const { message } = AntdApp.useApp()
  const currentUser = useUserStore((s) => s.currentUser)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<BankStatementRow[]>([])
  const [bankCode, setBankCode] = useState('1002')
  const [offsetCode, setOffsetCode] = useState('6001')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listAccounts().then(setAccounts) }, [])

  const parse = (kind: 'csv' | 'qif' | 'ofx') => {
    if (!raw.trim()) { message.warning('请粘贴或上传流水内容'); return }
    const r = kind === 'csv' ? parseBankCsv(raw) : kind === 'qif' ? parseQif(raw) : parseOfx(raw)
    if (r.length === 0) { message.warning('未解析到任何流水，请检查格式'); return }
    setRows(r)
  }

  const generate = async () => {
    const bank = accounts.find((a) => a.code === bankCode)
    const offset = accounts.find((a) => a.code === offsetCode)
    if (!bank || !offset) { message.error('请选择有效的银行科目与对方科目'); return }
    const opts: StatementImportOptions = {
      bankAccountCode: bank.code, bankAccountName: bank.name,
      offsetAccountCode: offset.code, offsetAccountName: offset.name,
    }
    const vouchers = buildVouchersFromRows(rows, opts)
    setBusy(true)
    try {
      for (const vc of vouchers) {
        await saveVoucher({ date: vc.date, entries: vc.entries, remark: '银行流水导入', creator: currentUser?.name ?? 'system' })
      }
      message.success(`已生成 ${vouchers.length} 张凭证草稿`)
      setRows([]); setRaw('')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const columns: ColumnsType<BankStatementRow> = [
    { title: '日期', dataIndex: 'date', width: 120 },
    { title: '摘要', dataIndex: 'summary' },
    { title: '金额', dataIndex: 'amount', width: 120, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#389E0D' : '#CF1322' }}>{formatMoney(v)}</span> },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960 }}>
      <Title level={3}>银行流水导入</Title>
      <Text type="secondary">粘贴或上传银行 CSV/QIF/OFX 流水，解析后选择科目并一键生成凭证草稿（自动平衡）。</Text>

      <Card size="small" style={{ marginTop: 12 }}>
        <Tabs
          items={[
            { key: 'paste', label: '粘贴文本', children: (
              <Input.TextArea rows={6} placeholder={'日期,摘要,金额\n2026-01-05,货款,1000\n2026-01-06,手续费,-20'} value={raw} onChange={(e) => setRaw(e.target.value)} />
            ) },
            { key: 'upload', label: '上传文件', children: (
              <input type="file" accept=".csv,.qif,.ofx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setRaw); e.target.value = '' } } />
            ) },
          ]}
        />
        <Space wrap style={{ marginTop: 8 }}>
          <Button onClick={() => parse('csv')}>按 CSV 解析</Button>
          <Button onClick={() => parse('qif')}>QIF</Button>
          <Button onClick={() => parse('ofx')}>OFX</Button>
        </Space>
      </Card>

      {rows.length > 0 && (
        <Card size="small" title={`已解析 ${rows.length} 条`} style={{ marginTop: 12 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <span>银行科目：</span>
            <Select value={bankCode} style={{ width: 200 }} options={accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} showSearch optionFilterProp="label" onChange={setBankCode} />
            <span>对方科目：</span>
            <Select value={offsetCode} style={{ width: 200 }} options={accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} showSearch optionFilterProp="label" onChange={setOffsetCode} />
            <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={generate}>生成凭证草稿</Button>
          </Space>
          <Table bordered size="small" pagination={{ pageSize: 20, showSizeChanger: false }} dataSource={rows} columns={columns} rowKey={(r, i) => String(i)} />
        </Card>
      )}

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
        说明：流入（正金额）记借银行/贷对方科目；流出（负金额）反之。对方科目请在生成前确认（如收入、费用或往来）。
      </Text>
    </div>
  )
}
