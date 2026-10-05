import { useEffect, useState } from 'react'
import {
  Card, Input, Button, Table, Tag, Space, Typography, App as AntdApp, Alert, Divider, Segmented, Result, Descriptions,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ThunderboltOutlined, PlusOutlined, AuditOutlined, FormOutlined, RobotOutlined } from '@ant-design/icons'
import { listAccounts } from '@/services/accountService'
import { parseNlSentence, type NlParseResult } from '@/services/nlAccountingService'
import { bookkeepingParse, type BookkeepingResult } from '@/services/agents/bookkeepingAgent'
import { auditVouchers, type AuditReport } from '@/services/agents/auditAgent'
import { suggestEntry, type EntrySuggestion } from '@/services/agents/dataEntryAgent'
import { listVouchers, saveVoucher } from '@/services/voucherService'
import { getCurrentAiConfig, AiNotConfiguredError } from '@/services/aiClient'
import { useUserStore } from '@/store/userStore'
import { useNavigate } from 'react-router-dom'
import type { Account, Voucher, VoucherEntry } from '@/types/models'
import { formatMoney, currentPeriod } from '@/utils/format'

const { Title, Paragraph, Text } = Typography

const EXAMPLES = ['发工资5万', '销售收入货款12万', '报销差旅费2000', '采购办公用品1000', '缴纳增值税5000', '提取现金3万']

type Mode = 'bookkeeping' | 'audit' | 'entry'

export function NlAccountingEntryPage() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const currentUser = useUserStore((s) => s.currentUser)

  const [mode, setMode] = useState<Mode>('bookkeeping')
  const [aiReady, setAiReady] = useState<boolean | null>(null) // null=加载中

  // 记账
  const [text, setText] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [result, setResult] = useState<BookkeepingResult | NlParseResult | null>(null)
  const [busy, setBusy] = useState(false)

  // 审核
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [auditing, setAuditing] = useState(false)

  // 录入
  const [entryText, setEntryText] = useState('')
  const [entrySuggestion, setEntrySuggestion] = useState<EntrySuggestion | null>(null)
  const [entryBusy, setEntryBusy] = useState(false)

  useEffect(() => {
    listAccounts().then(setAccounts)
    getCurrentAiConfig().then((cfg) => setAiReady(!!cfg && cfg.enabled && !!cfg.apiKey))
  }, [])

  // ============ 记账 ============
  const handleBook = async () => {
    if (!text.trim()) {
      message.warning('请输入记账描述')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      // 优先用 LLM；未配置则自动回退本地规则引擎
      let r: BookkeepingResult
      try {
        r = await bookkeepingParse(text, accounts)
      } catch (e) {
        if (e instanceof AiNotConfiguredError) {
          const local = parseNlSentence(text, accounts)
          r = { ...local, engine: 'local' }
          message.info('未配置 AI，已用本地规则引擎解析（12 类常见业务）')
        } else {
          throw e
        }
      }
      setResult(r)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (!result || result.entries.length === 0) return
    setBusy(true)
    try {
      const voucher = await saveVoucher({
        date: new Date().toISOString().slice(0, 10),
        entries: result.entries as VoucherEntry[],
        remark: result.summary || '智能记账',
        creator: currentUser?.name ?? 'system',
      })
      message.success('已生成凭证草稿，请在凭证编辑页核对后审核')
      navigate(`/voucher/edit/${voucher.id}`)
    } catch (e) {
      message.error((e as Error).message || '生成凭证失败')
    } finally {
      setBusy(false)
    }
  }

  // ============ 审核 ============
  const handleAudit = async () => {
    setAuditing(true)
    setAuditReport(null)
    try {
      const period = currentPeriod()
      const vouchers = (await listVouchers({ period })).filter((v: Voucher) => v.status === 'audited')
      const report = await auditVouchers(vouchers)
      setAuditReport(report)
      if (report.findings.length === 0) message.success('AI 复核未发现明显问题')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAuditing(false)
    }
  }

  // ============ 录入 ============
  const handleEntry = async () => {
    if (!entryText.trim()) return
    setEntryBusy(true)
    setEntrySuggestion(null)
    try {
      setEntrySuggestion(await suggestEntry(entryText))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setEntryBusy(false)
    }
  }

  const columns: ColumnsType<VoucherEntry> = [
    { title: '科目编码', dataIndex: 'accountCode', width: 110 },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '借方', dataIndex: 'debit', width: 130, align: 'right', render: (v: number) => (v ? formatMoney(v) : '') },
    { title: '贷方', dataIndex: 'credit', width: 130, align: 'right', render: (v: number) => (v ? formatMoney(v) : '') },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <RobotOutlined style={{ fontSize: 22, color: '#1B5FE3' }} />
        <Title level={3} style={{ margin: 0 }}>AI 财务助手</Title>
        {aiReady === true ? <Tag color="success">AI 已连接</Tag> : aiReady === false ? <Tag color="warning">本地规则模式（未配置 Key）</Tag> : null}
      </div>
      <Paragraph type="secondary">
        一个 Agent 团队协作：记账 Agent 录凭证、审核 Agent 查问题、录入 Agent 抽字段。在「系统设置 → AI 助手」配置你自己的 Key 后启用大模型能力。
      </Paragraph>

      {aiReady === false && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="当前未连接大模型"
          description={<>记账仍可用本地规则引擎（覆盖 12 类常见业务）；审核与录入 Agent 需要你先在 <a href="/system/ai">AI 助手配置</a> 填入自己的 API Key。</>}
        />
      )}

      <Segmented
        className="mb-4"
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        options={[
          { value: 'bookkeeping', label: <Space><ThunderboltOutlined />记账 Agent</Space> },
          { value: 'audit', label: <Space><AuditOutlined />审核 Agent</Space> },
          { value: 'entry', label: <Space><FormOutlined />录入 Agent</Space> },
        ]}
      />

      {/* ============ 记账 Agent ============ */}
      {mode === 'bookkeeping' && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Input.TextArea
              rows={2}
              placeholder="例如：发工资5万 / 销售收入货款12万 / 报销差旅费2000"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Space wrap>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={handleBook}>
                {aiReady ? '让 AI 记账' : '本地规则解析'}
              </Button>
              <Button icon={<PlusOutlined />} disabled={!result || result.entries.length === 0} loading={busy} onClick={handleGenerate}>
                生成凭证草稿
              </Button>
            </Space>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>试试：</Text>
              {EXAMPLES.map((ex) => (
                <Tag key={ex} style={{ cursor: 'pointer', margin: 4 }} onClick={() => setText(ex)}>{ex}</Tag>
              ))}
            </div>
          </Space>

          {result && (
            <>
              <Divider />
              {(result.warnings?.length ?? 0) > 0 && (
                <Alert
                  type={result.entries.length ? 'warning' : 'error'}
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="需要确认"
                  description={result.warnings!.map((w, i) => <div key={i}>· {w}</div>)}
                />
              )}
              <Table bordered size="small" pagination={false} rowKey="id" dataSource={result.entries} columns={columns} />
              <Divider />
              <Text type="secondary" style={{ fontSize: 12 }}>
                凭证摘要：{result.summary || '（未生成）'} · 引擎：{'engine' in result && result.engine === 'llm' ? '大模型' : '本地规则'}。
                生成后为草稿状态，请核对科目与金额后再审核入账。
              </Text>
            </>
          )}
        </Card>
      )}

      {/* ============ 审核 Agent ============ */}
      {mode === 'audit' && (
        <Card size="small" title="审核本期已审核凭证" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            AI 扮演财务主管，对本月已审核凭证做合规与合理性复核，只提问题、不自动改账。
          </Paragraph>
          <Button type="primary" icon={<AuditOutlined />} loading={auditing} onClick={handleAudit}>
            开始审核 {currentPeriod()} 凭证
          </Button>
          {auditReport && (
            <>
              <Divider />
              <Alert type={auditReport.findings.length ? 'warning' : 'success'} showIcon
                message={auditReport.summary || (auditReport.findings.length ? '发现待确认问题' : '未发现明显问题')} />
              {auditReport.findings.length > 0 && (
                <Table
                  className="mt-3"
                  size="small"
                  rowKey={(r) => r.voucherNo + r.issue}
                  pagination={false}
                  dataSource={auditReport.findings}
                  columns={[
                    {
                      title: '级别', dataIndex: 'severity', width: 80,
                      render: (s: string) => <Tag color={s === 'high' ? 'red' : s === 'medium' ? 'orange' : 'default'}>{s === 'high' ? '高' : s === 'medium' ? '中' : '低'}</Tag>,
                    },
                    { title: '凭证号', dataIndex: 'voucherNo', width: 160 },
                    { title: '问题', dataIndex: 'issue' },
                    { title: '建议', dataIndex: 'suggestion' },
                  ]}
                />
              )}
            </>
          )}
        </Card>
      )}

      {/* ============ 录入 Agent ============ */}
      {mode === 'entry' && (
        <Card size="small" title="一句话录数据" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            例如：「客户宏远科技，电话13800001111，欠我们货款5000」——AI 自动抽出字段，你确认后去对应表单填。
          </Paragraph>
          <Input.TextArea rows={2} value={entryText} onChange={(e) => setEntryText(e.target.value)}
            placeholder="描述你要登记的往来单位/报销/发票信息" />
          <div className="mt-3">
            <Button type="primary" icon={<FormOutlined />} loading={entryBusy} onClick={handleEntry}>抽取字段</Button>
          </div>
          {entrySuggestion && (
            <>
              <Divider />
              <Descriptions size="small" bordered column={1} title={`识别类型：${entrySuggestion.kind}`}>
                {Object.entries(entrySuggestion.fields).map(([k, v]) => (
                  <Descriptions.Item key={k} label={k}>{String(v)}</Descriptions.Item>
                ))}
              </Descriptions>
              <div className="mt-2 text-[12px] text-ink-500">{entrySuggestion.suggestion}</div>
            </>
          )}
        </Card>
      )}

      {!aiReady && mode !== 'bookkeeping' && (
        <Result status="info" title="此 Agent 需要先配置 AI" subTitle="前往「系统设置 → AI 助手」填入你自己的 API Key。"
          extra={<Button type="primary" onClick={() => navigate('/system/ai')}>去配置</Button>} />
      )}
    </div>
  )
}
