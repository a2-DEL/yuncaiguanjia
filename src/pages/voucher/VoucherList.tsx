import { useEffect, useMemo, useState } from 'react'
import {
  Card, Table, Button, Select, Input, DatePicker, Tag, Space, App as AntdApp, Dropdown, Popconfirm, Tooltip, Modal,
} from 'antd'
import { PlusOutlined, FileExcelOutlined, AuditOutlined, RollbackOutlined, CopyOutlined, ThunderboltOutlined, DeleteOutlined, EyeOutlined, PrinterOutlined, LockOutlined, PaperClipOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  listVouchers, auditVoucher, unauditVoucher, voidVoucher, copyVoucher, reverseVoucher, deleteVoucher,
  voucherTotalDebit, voucherTotalCredit,
} from '@/services/voucherService'
import { VOUCHER_STATUS_LABEL, type Voucher, type VoucherStatus } from '@/types/models'
import { formatMoney } from '@/utils/format'
import { db } from '@/db/database'
import { SubjectTreeSelect } from '@/components/SubjectTreeSelect'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { getClosingOverview } from '@/services/closingService'
import { usePermission } from '@/hooks/usePermission'

const STATUS_COLOR: Record<VoucherStatus, string> = {
  draft: 'default',
  pending: 'gold',
  audited: 'green',
  void: 'red',
}

export function VoucherListPage() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { can } = usePermission()
  const [data, setData] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<string>('all')
  const [status, setStatus] = useState<VoucherStatus | 'all'>('all')
  const [accountCode, setAccountCode] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [closedPeriods, setClosedPeriods] = useState<Set<string>>(new Set())
  const [previewIds, setPreviewIds] = useState<string[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  // 已结账期间（用于凭证锁定）
  useEffect(() => {
    getClosingOverview().then((rows) => setClosedPeriods(new Set(rows.filter((r) => r.isClosed).map((r) => r.period))))
  }, [])

  const refresh = async () => {
    setLoading(true)
    const list = await listVouchers({
      period: period === 'all' ? undefined : period,
      status: status === 'all' ? undefined : status,
      accountCode,
      keyword: keyword || undefined,
    })
    setData(list)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, status, accountCode, keyword])

  const periods = useMemo(() => Array.from(new Set(data.map((v) => v.period))).sort().reverse(), [data])

  const columns: ColumnsType<Voucher> = [
    { title: '凭证号', dataIndex: 'voucherNo', width: 150, fixed: 'left', render: (v) => <span className="font-medium tabular-nums text-brand-600 dark:text-brand-300">{v}</span> },
    { title: '日期', dataIndex: 'date', width: 110, render: (v) => <span className="tabular-nums">{v}</span> },
    {
      title: '摘要',
      dataIndex: 'summary',
      render: (_, r) => {
        const first = r.entries[0]?.summary ?? ''
        return (
          <span>
            {first}
            {r.entries.length > 1 && <span className="text-ink-500"> 等 {r.entries.length} 笔</span>}
          </span>
        )
      },
    },
    { title: '借方合计', width: 130, align: 'right', render: (_, r) => <span className="tabular-nums font-medium">{formatMoney(voucherTotalDebit(r.entries))}</span> },
    { title: '贷方合计', width: 130, align: 'right', render: (_, r) => <span className="tabular-nums font-medium">{formatMoney(voucherTotalCredit(r.entries))}</span> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: VoucherStatus, r) =>
        closedPeriods.has(r.period) ? (
          <Tooltip title="该期间已结账，凭证已锁定">
            <Tag color="default"><LockOutlined /> 已锁定</Tag>
          </Tooltip>
        ) : (
          <Tag color={STATUS_COLOR[s]}>{VOUCHER_STATUS_LABEL[s]}</Tag>
        ),
    },
    { title: '制单人', dataIndex: 'creator', width: 90 },
    {
      title: '附件',
      dataIndex: 'attachments',
      width: 80,
      render: (arr: string[]) =>
        arr && arr.length > 0 ? (
          <Button type="link" size="small" icon={<PaperClipOutlined />} onClick={() => setPreviewIds(arr)}>
            {arr.length}
          </Button>
        ) : (
          <span className="text-ink-400">--</span>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, r) => {
        const locked = closedPeriods.has(r.period)
        if (locked) {
          return (
            <Space size={4}>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/voucher/edit/${r.id}`)}>
                查看
              </Button>
              <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => printVoucher(r)}>
                打印
              </Button>
            </Space>
          )
        }
        return (
          <Space size={4}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/voucher/edit/${r.id}`)}>
              查看
            </Button>
            {r.status !== 'audited' && r.status !== 'void' && can('voucher:audit') && (
              <Button type="link" size="small" icon={<AuditOutlined />} onClick={async () => { await auditVoucher(r.id); message.success('已审核'); refresh() }}>
                审核
              </Button>
            )}
            {r.status === 'audited' && can('voucher:audit') && (
              <Button type="link" size="small" icon={<RollbackOutlined />} onClick={async () => { await unauditVoucher(r.id); message.success('已反审核'); refresh() }}>
                反审
              </Button>
            )}
            <Dropdown
              menu={{
                items: [
                  { key: 'copy', icon: <CopyOutlined />, label: '复制', disabled: r.status === 'void' || !can('voucher:export') },
                  { key: 'reverse', icon: <ThunderboltOutlined />, label: '红冲', disabled: r.status === 'void' || !can('voucher:export') },
                  { key: 'print', icon: <PrinterOutlined />, label: '打印' },
                  { type: 'divider' },
                  { key: 'void', icon: <DeleteOutlined />, label: '作废', disabled: r.status === 'void' || !can('voucher:delete') },
                ],
                onClick: async ({ key, domEvent }) => {
                  domEvent.stopPropagation()
                  if (key === 'copy') { await copyVoucher(r.id); message.success('已复制为草稿'); refresh() }
                  if (key === 'reverse') { await reverseVoucher(r.id); message.success('已生成红冲凭证'); refresh() }
                  if (key === 'print') printVoucher(r)
                  if (key === 'void') { await voidVoucher(r.id); message.success('已作废'); refresh() }
                },
              }}
            >
              <Button type="link" size="small">更多</Button>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  const batchPrint = () => {
    const list = data.filter((v) => selectedRowKeys.includes(v.id))
    if (!list.length) return
    printVouchersBatch(list)
    setSelectedRowKeys([])
  }

  const exportCsv = () => {
    const header = ['凭证号', '日期', '摘要', '借方合计', '贷方合计', '状态', '制单人']
    const rows = data.map((v) => [
      v.voucherNo, v.date, v.entries[0]?.summary ?? '', voucherTotalDebit(v.entries), voucherTotalCredit(v.entries), VOUCHER_STATUS_LABEL[v.status], v.creator,
    ])
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `凭证明细_${dayjs().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 CSV')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">凭证管理</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            企业全部记账凭证的录入、审核、查询与归档，支持借贷平衡校验、红冲复制与打印导出。
          </p>
        </div>
        <Space>
          {selectedRowKeys.length > 0 && can('voucher:export') && (
            <Button icon={<PrinterOutlined />} onClick={batchPrint}>批量打印({selectedRowKeys.length})</Button>
          )}
          {can('voucher:export') && <Button icon={<FileExcelOutlined />} onClick={exportCsv}>导出</Button>}
          {can('voucher:create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/voucher/edit')}>
            新增凭证
          </Button>}
        </Space>
      </div>

      <Card className="shadow-card" styles={{ body: { padding: 16 } }}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select
            value={period}
            style={{ width: 140 }}
            onChange={setPeriod}
            options={[{ value: 'all', label: '全部期间' }, ...periods.map((p) => ({ value: p, label: p }))]}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            onChange={setStatus}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'draft', label: '草稿' },
              { value: 'pending', label: '待审核' },
              { value: 'audited', label: '已审核' },
              { value: 'void', label: '已作废' },
            ]}
          />
          <div className="w-52">
            <SubjectTreeSelect value={accountCode} onChange={setAccountCode} placeholder="按科目筛选" />
          </div>
          <Input.Search
            allowClear
            placeholder="搜索凭证号/摘要/制单人"
            style={{ width: 240 }}
            onSearch={setKeyword}
            onChange={(e) => !e.target.value && setKeyword('')}
          />
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 张凭证` }}
          size="middle"
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as string[]) }}
        />
      </Card>

      <Modal title="附件预览" open={previewIds.length > 0} onCancel={() => setPreviewIds([])} footer={null} width={520}>
        <AttachmentPreview attachmentIds={previewIds} />
      </Modal>
    </div>
  )
}

/** 人民币大写金额 */
function toChineseRMB(n: number): string {
  if (!isFinite(n)) return ''
  const fraction = ['角', '分']
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']]
  const head = n < 0 ? '负' : ''
  n = Math.abs(n)
  let s = ''
  for (let i = 0; i < fraction.length; i++) {
    s += (digit[Math.floor(n * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '')
  }
  s = s || '整'
  let intPart = Math.floor(n)
  for (let i = 0; i < unit[0].length && intPart > 0; i++) {
    let p = ''
    for (let j = 0; j < unit[1].length && intPart > 0; j++) {
      p = digit[intPart % 10] + unit[1][j] + p
      intPart = Math.floor(intPart / 10)
    }
    s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s
  }
  return head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整')
}

function voucherBlockHtml(v: Voucher, companyName: string): string {
  const total = voucherTotalDebit(v.entries)
  const attachCount = v.attachments?.length ?? 0
  const rows = v.entries
    .map(
      (e, i) => `<tr>
        <td style="padding:7px;border:1px solid #999;text-align:center">${i + 1}</td>
        <td style="padding:7px;border:1px solid #999">${e.summary}</td>
        <td style="padding:7px;border:1px solid #999">${e.accountCode} ${e.accountName}</td>
        <td style="padding:7px;border:1px solid #999;text-align:right">${e.debit ? formatMoney(e.debit) : ''}</td>
        <td style="padding:7px;border:1px solid #999;text-align:right">${e.credit ? formatMoney(e.credit) : ''}</td>
      </tr>`,
    )
    .join('')
  const totalRow = `<tr style="font-weight:700;background:#fafafa">
    <td style="padding:7px;border:1px solid #999;text-align:center" colspan="3">合计（${toChineseRMB(total)}）</td>
    <td style="padding:7px;border:1px solid #999;text-align:right">${formatMoney(total)}</td>
    <td style="padding:7px;border:1px solid #999;text-align:right">${formatMoney(total)}</td>
  </tr>`
  return `<div class="wrap">
    <div class="head">
      <div class="co">${companyName}</div>
      <div class="tt">记账凭证</div>
      <div style="font-size:13px">第 ${v.voucherNo} 号</div>
    </div>
    <div class="meta">
      <span>日期：${v.date}</span>
      <span>附单据：${attachCount} 张</span>
      <span>制单人：${v.creator ?? ''}</span>
    </div>
    <table>
      <thead><tr>
        <th style="padding:7px;border:1px solid #999;width:36px">序号</th>
        <th style="padding:7px;border:1px solid #999">摘要</th>
        <th style="padding:7px;border:1px solid #999">会计科目</th>
        <th style="padding:7px;border:1px solid #999">借方金额</th>
        <th style="padding:7px;border:1px solid #999">贷方金额</th>
      </tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
    <div class="sign">
      <span>制单：${v.creator ?? ''}</span>
      <span>审核：${v.auditor ?? ''}</span>
      <span>记账：</span>
      <span>出纳：</span>
    </div>
  </div>`
}

const PRINT_STYLE = `
  @media print { @page { size: A4; margin: 14mm; } }
  body { font-family: 'Microsoft YaHei', sans-serif; color: #222; }
  .wrap { width: 760px; margin: 0 auto 24px; page-break-inside: avoid; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:3px double #333; padding-bottom:8px }
  .head .co { font-size:20px; font-weight:800; letter-spacing:2px }
  .head .tt { font-size:22px; font-weight:800; letter-spacing:6px }
  .meta { display:flex; justify-content:space-between; font-size:13px; margin:10px 2px }
  table { width:100%; border-collapse:collapse; font-size:13px }
  th { background:#f0f0f0 }
  .sign { display:flex; justify-content:space-between; font-size:13px; margin-top:28px; padding:0 8px }
  .summary { width:760px; margin:0 auto 16px; page-break-inside: avoid; }
`

async function printVoucher(v: Voucher) {
  const w = window.open('', '_blank')
  if (!w) return
  const companyName = (await db.settings.get('companyName'))?.value || '云财管家'
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>记账凭证 ${v.voucherNo}</title><style>${PRINT_STYLE}</style></head><body>${voucherBlockHtml(v, companyName)}<script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}

/** 批量打印：先打印凭证汇总表，再逐张打印所选凭证 */
async function printVouchersBatch(list: Voucher[]) {
  const w = window.open('', '_blank')
  if (!w) return
  const companyName = (await db.settings.get('companyName'))?.value || '云财管家'
  const grandDebit = Math.round(list.reduce((s, v) => s + voucherTotalDebit(v.entries), 0) * 100) / 100
  const grandCredit = Math.round(list.reduce((s, v) => s + voucherTotalCredit(v.entries), 0) * 100) / 100
  const summaryRows = list
    .map(
      (v) => `<tr>
        <td style="padding:6px;border:1px solid #999">${v.voucherNo}</td>
        <td style="padding:6px;border:1px solid #999">${v.date}</td>
        <td style="padding:6px;border:1px solid #999">${v.entries[0]?.summary ?? ''}</td>
        <td style="padding:6px;border:1px solid #999;text-align:right">${formatMoney(voucherTotalDebit(v.entries))}</td>
        <td style="padding:6px;border:1px solid #999;text-align:right">${formatMoney(voucherTotalCredit(v.entries))}</td>
      </tr>`,
    )
    .join('')
  const summary = `<div class="summary">
    <h3 style="text-align:center;margin:0 0 8px">凭证汇总表（共 ${list.length} 张）</h3>
    <table>
      <thead><tr><th style="padding:6px;border:1px solid #999">凭证号</th><th style="padding:6px;border:1px solid #999">日期</th><th style="padding:6px;border:1px solid #999">摘要</th><th style="padding:6px;border:1px solid #999">借方合计</th><th style="padding:6px;border:1px solid #999">贷方合计</th></tr></thead>
      <tbody>${summaryRows}<tr style="font-weight:700;background:#fafafa"><td style="padding:6px;border:1px solid #999" colspan="3">合计</td><td style="padding:6px;border:1px solid #999;text-align:right">${formatMoney(grandDebit)}</td><td style="padding:6px;border:1px solid #999;text-align:right">${formatMoney(grandCredit)}</td></tr></tbody>
    </table>
  </div>`
  const blocks = list.map((v) => voucherBlockHtml(v, companyName)).join('')
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>凭证批量打印（${list.length}张）</title><style>${PRINT_STYLE}</style></head><body>${summary}${blocks}<script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}
