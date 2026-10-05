import { useEffect, useState } from 'react'
import {
  Card, Select, Input, Table, Tag, Space, Empty, Button, Alert, App as AntdApp,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileSearchOutlined, SafetyCertificateOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  queryLogs, listLogModules, verifyLogChain, type LogQuery, type LogChainVerification,
} from '@/services/logService'
import { exportAuditTrail } from '@/services/exportService'
import type { OperationLog } from '@/types/models'

const fmt = (t: number) => dayjs(t).format('YYYY-MM-DD HH:mm')

export function LogAuditPage() {
  const { message } = AntdApp.useApp()
  const [data, setData] = useState<OperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modules, setModules] = useState<string[]>([])
  const [module, setModule] = useState<string>()
  const [userName, setUserName] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [verify, setVerify] = useState<LogChainVerification | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    listLogModules().then(setModules)
  }, [])

  const load = async () => {
    setLoading(true)
    const q: LogQuery = {
      module,
      userName: userName.trim() || undefined,
      keyword: keyword.trim() || undefined,
      page,
      pageSize,
    }
    const { rows, total } = await queryLogs(q)
    setData(rows)
    setTotal(total)
    setLoading(false)
  }
  useEffect(() => { load() }, [module, userName, keyword, page])

  const runVerify = async () => {
    setVerifying(true)
    const result = await verifyLogChain()
    setVerify(result)
    setVerifying(false)
    if (result.ok) message.success(`审计链完整，共校验 ${result.count} 条日志`)
    else message.error(`发现 ${result.tampered.length} 条被篡改或断裂的日志`)
  }

  const runExport = async () => {
    setExporting(true)
    try {
      const { count, ok } = await exportAuditTrail()
      message.success(`已导出审计追溯包（${count} 条日志，完整性：${ok ? '通过' : '异常'}）`)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<OperationLog> = [
    { title: '时间', dataIndex: 'time', width: 160, render: (t: number) => <span className="tabular-nums">{fmt(t)}</span> },
    { title: '模块', dataIndex: 'module', width: 120, render: (t: string) => <Tag color="blue">{t}</Tag> },
    { title: '操作', dataIndex: 'action', width: 120 },
    { title: '操作人', dataIndex: 'userName', width: 100 },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    {
      title: '链指',
      dataIndex: 'hash',
      width: 90,
      render: (h?: string) => (h
        ? <Tag color="green">{h.slice(0, 6)}…</Tag>
        : <Tag>未上链</Tag>),
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">操作日志</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
          系统全部操作留痕，按时间倒序记录；支持按模块、操作人与关键字筛选，便于审计追溯。
        </p>
      </div>

      <Card className="shadow-card" styles={{ body: { padding: 16 } }}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select
            value={module}
            style={{ width: 160 }}
            allowClear
            placeholder="按模块筛选"
            onChange={(v) => { setModule(v); setPage(1) }}
            options={modules.map((m) => ({ value: m, label: m }))}
          />
          <Input
            allowClear
            placeholder="操作人"
            style={{ width: 140 }}
            value={userName}
            onChange={(e) => { setUserName(e.target.value); setPage(1) }}
          />
          <Input.Search
            allowClear
            placeholder="搜索操作 / 详情"
            style={{ width: 240 }}
            onSearch={(v) => { setKeyword(v); setPage(1) }}
            onChange={(e) => !e.target.value && setKeyword('')}
          />
          <Space style={{ marginLeft: 'auto' }}>
            <Button icon={<SafetyCertificateOutlined />} loading={verifying} onClick={runVerify}>
              审计链完整性校验
            </Button>
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={runExport}>
              导出审计追溯
            </Button>
          </Space>
        </div>

        {verify && (
          <Alert
            className="mb-4"
            type={verify.ok ? 'success' : 'error'}
            showIcon
            message={verify.ok
              ? `审计哈希链完整：共 ${verify.count} 条日志，无篡改`
              : `检测到 ${verify.tampered.length} 条异常日志（哈希不匹配或链断裂）`}
          />
        )}

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (t) => `共 ${t} 条日志`,
            onChange: (p) => setPage(p),
          }}
          size="middle"
          locale={{ emptyText: <Empty description="暂无操作日志" /> }}
        />
      </Card>
    </div>
  )
}
