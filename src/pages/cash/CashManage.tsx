import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Tag, App as AntdApp,
  Space, Popconfirm, Switch, Row, Col, DatePicker, Alert,
} from 'antd'
import { PlusOutlined, BankOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  listBankAccounts, createBankAccount, updateBankAccount, toggleBankAccountStatus,
  listCashFlows, recordCashFlow, deleteCashFlow, reconcileCashFlow, getAccountSummary, getJournal,
  type AccountSummary,
} from '@/services/bankService'
import {
  CASH_ACCOUNT_TYPE_LABEL, CASH_FLOW_TYPE_LABEL, type BankAccount, type CashFlow, type CashFlowType, type Account,
} from '@/types/models'
import { listAccounts } from '@/services/accountService'
import { money } from '@/utils/format'
import { usePermission } from '@/hooks/usePermission'

export function CashManagePage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [summary, setSummary] = useState<AccountSummary[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [glAccounts, setGlAccounts] = useState<Account[]>([])
  const [flows, setFlows] = useState<CashFlow[]>([])
  const [acctFilter, setAcctFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [journalAccount, setJournalAccount] = useState<string>('')
  const [journal, setJournal] = useState<{ initialBalance: number; entries: any[] }>({ initialBalance: 0, entries: [] })

  const [acctModal, setAcctModal] = useState(false)
  const [editingAcct, setEditingAcct] = useState<BankAccount | null>(null)
  const [acctForm] = Form.useForm()

  const [flowModal, setFlowModal] = useState(false)
  const [flowForm] = Form.useForm()

  const accountNameMap = useMemo(() => {
    const m = new Map<string, string>()
    accounts.forEach((a) => m.set(a.id, a.name))
    return m
  }, [accounts])

  const glOptions = useMemo(
    () => glAccounts.filter((a) => a.isLeaf && a.status === 'active').map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
    [glAccounts],
  )

  const load = async () => {
    const s = await getAccountSummary()
    setSummary(s)
    setAccounts(s.map((x) => x.account))
    if (!journalAccount && s[0]) setJournalAccount(s[0].account.id)
  }

  useEffect(() => {
    load()
    listAccounts().then(setGlAccounts)
  }, [])

  useEffect(() => {
    listCashFlows({
      accountId: acctFilter === 'all' ? undefined : acctFilter,
      type: typeFilter === 'all' ? undefined : (typeFilter as CashFlowType),
    }).then(setFlows)
  }, [acctFilter, typeFilter])

  useEffect(() => {
    if (journalAccount) getJournal(journalAccount).then(setJournal)
  }, [journalAccount, flows])

  const reloadFlows = () =>
    listCashFlows({
      accountId: acctFilter === 'all' ? undefined : acctFilter,
      type: typeFilter === 'all' ? undefined : (typeFilter as CashFlowType),
    }).then(setFlows)

  const openAcctModal = (a?: BankAccount) => {
    setEditingAcct(a ?? null)
    acctForm.setFieldsValue(
      a ? { ...a } : { type: 'bank', currency: 'CNY', initialBalance: 0, glAccountCode: '100201' },
    )
    setAcctModal(true)
  }

  const submitAcct = async () => {
    const v = await acctForm.validateFields()
    if (editingAcct) {
      await updateBankAccount(editingAcct.id, v)
      message.success('账户已更新')
    } else {
      await createBankAccount(v)
      message.success('账户已新增')
    }
    setAcctModal(false)
    load()
  }

  const openFlowModal = () => {
    if (accounts.length === 0) { message.warning('请先新增资金账户'); return }
    flowForm.setFieldsValue({ date: dayjs(), type: 'income', category: '销售收入' })
    setFlowModal(true)
  }

  const submitFlow = async () => {
    const v = await flowForm.validateFields()
    const payload = {
      date: (v.date as Dayjs).format('YYYY-MM-DD'),
      accountId: v.accountId,
      type: v.type as CashFlowType,
      category: v.category,
      counterparty: v.counterparty,
      amount: v.amount,
      summary: v.summary,
      relatedAccountId: v.relatedAccountId,
      offsetAccountCode: v.offsetAccountCode,
    }
    await recordCashFlow(payload)
    message.success('资金流水已登记，并已自动生成记账凭证')
    setFlowModal(false)
    load()
    reloadFlows()
  }

  const acctColumns = [
    { title: '账户名称', dataIndex: 'name', render: (t: string, r: BankAccount) => <span className="font-medium">{t}{r.type === 'cash' && <Tag className="ml-2" color="green">现金</Tag>}</span> },
    { title: '类型', dataIndex: 'type', render: (t: string) => CASH_ACCOUNT_TYPE_LABEL[t as keyof typeof CASH_ACCOUNT_TYPE_LABEL] },
    { title: '开户行/账号', key: 'bank', render: (_: any, r: BankAccount) => r.type === 'bank' ? `${r.bankName ?? '--'}<br/>${r.accountNo ?? '--'}` : '—' },
    { title: '对应科目', dataIndex: 'glAccountCode', render: (t: string) => t ?? <span className="text-ink-400">未设置</span> },
    { title: '当前余额', key: 'balance', render: (_: any, r: BankAccount) => {
        const s = summary.find((x) => x.account.id === r.id)
        return <span className="tabular-nums font-medium">{money(s?.balance ?? 0)}</span>
      } },
    { title: '状态', dataIndex: 'status', render: (t: string) => t === 'active' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    { title: '操作', key: 'op', render: (_: any, r: BankAccount) => (
        <Space>
          {can('cash:manage') && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openAcctModal(r)}>编辑</Button>}
          {can('cash:manage') && <Popconfirm title={`确认${r.status === 'active' ? '停用' : '启用'}该账户？`} onConfirm={async () => { await toggleBankAccountStatus(r.id, r.status === 'active'); message.success('已更新'); load() }}>
            <Button type="link" size="small">{r.status === 'active' ? '停用' : '启用'}</Button>
          </Popconfirm>}
        </Space>
      ) },
  ]

  const flowColumns = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '账户', dataIndex: 'accountId', render: (id: string) => accountNameMap.get(id) },
    { title: '类型', dataIndex: 'type', render: (t: string) => {
        const c = t === 'income' ? 'green' : t === 'expense' ? 'red' : 'blue'
        return <Tag color={c}>{CASH_FLOW_TYPE_LABEL[t as keyof typeof CASH_FLOW_TYPE_LABEL]}</Tag>
      } },
    { title: '类别', dataIndex: 'category' },
    { title: '对方', dataIndex: 'counterparty', render: (t: string) => t ?? '--' },
    { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number, r: CashFlow) => <span className="tabular-nums">{r.type === 'expense' ? '-' : ''}{money(v)}</span> },
    { title: '对账', dataIndex: 'reconciled', render: (ok: boolean, r: CashFlow) => can('cash:manage') ? (
        <Switch size="small" checked={ok} onChange={async (c) => { await reconcileCashFlow(r.id, c); reloadFlows() }} />
      ) : <Tag>--</Tag> },
    { title: '凭证号', dataIndex: 'voucherNo', render: (t: string) => t ?? '--' },
    { title: '操作', key: 'op', render: (_: any, r: CashFlow) => (
        can('cash:manage') ? (
          <Popconfirm title="确认删除该流水？" onConfirm={async () => { await deleteCashFlow(r.id); message.success('已删除'); load(); reloadFlows() }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        ) : null
      ) },
  ]

  const journalColumns = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '类型', dataIndex: 'type', width: 80, render: (t: string) => t ? <Tag color={t === 'income' ? 'green' : t === 'expense' ? 'red' : 'blue'}>{CASH_FLOW_TYPE_LABEL[t as keyof typeof CASH_FLOW_TYPE_LABEL]}</Tag> : '' },
    { title: '摘要', dataIndex: 'summary' },
    { title: '对方', dataIndex: 'counterparty', render: (t: string) => t ?? '--' },
    { title: '借方', dataIndex: 'debit', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{v ? money(v) : ''}</span> },
    { title: '贷方', dataIndex: 'credit', align: 'right' as const, render: (v: number) => <span className="tabular-nums">{v ? money(v) : ''}</span> },
    { title: '余额', dataIndex: 'balance', align: 'right' as const, render: (v: number) => <span className="tabular-nums font-medium">{money(v)}</span> },
  ]

  const journalData = [{ date: '期初余额', type: '', summary: '——', counterparty: '', debit: 0, credit: 0, balance: journal.initialBalance }, ...journal.entries]

  const totalFunds = summary.reduce((s, x) => s + x.balance, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">出纳资金管理</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">银行账户与现金账户的收支流水、日记账与对账管理，收付款自动生成记账凭证。</p>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#16181d]">
            <div className="text-[13px] text-ink-500 dark:text-white/55">资金总额</div>
            <div className="mt-2 text-[24px] font-semibold tabular-nums text-ink-900 dark:text-white">{money(totalFunds)}</div>
            <div className="mt-1 text-[12px] text-ink-500 dark:text-white/45">全部启用账户余额合计</div>
          </div>
        </Col>
        {summary.map((s) => (
          <Col xs={12} md={6} key={s.account.id}>
            <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#16181d]">
              <div className="text-[13px] text-ink-500 dark:text-white/55">{s.account.name}</div>
              <div className="mt-2 text-[24px] font-semibold tabular-nums text-ink-900 dark:text-white">{money(s.balance)}</div>
              <div className="mt-1 text-[12px] text-ink-500 dark:text-white/45">收 {money(s.income)} · 付 {money(s.expense)}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Alert
        type="info"
        showIcon
        message="收付款与转账登记后自动生成一张平衡记账凭证"
        description="每笔资金流水会同步写入总账（现金/银行存款科目与对方科目），确保出纳日记账与总分类账、明细账保持一致，杜绝账账不符。"
      />

      <Tabs
        defaultActiveKey="account"
        items={[
          {
            key: 'account',
            label: '账户管理',
            children: (
              <Card className="shadow-card" extra={can('cash:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => openAcctModal()}>新增账户</Button>}>
                <Table rowKey="id" columns={acctColumns} dataSource={accounts} pagination={false} size="middle" />
              </Card>
            ),
          },
          {
            key: 'flow',
            label: '资金流水',
            children: (
              <Card className="shadow-card"
                extra={
                  <Space>
                    <Select value={acctFilter} style={{ width: 150 }} onChange={setAcctFilter} options={[{ value: 'all', label: '全部账户' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
                    <Select value={typeFilter} style={{ width: 110 }} onChange={setTypeFilter} options={[{ value: 'all', label: '全部类型' }, { value: 'income', label: '收款' }, { value: 'expense', label: '付款' }, { value: 'transfer', label: '转账' }]} />
                    {can('cash:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={openFlowModal}>登记流水</Button>}
                  </Space>
                }
              >
                <Table rowKey="id" columns={flowColumns} dataSource={flows} pagination={{ pageSize: 8 }} size="middle" />
              </Card>
            ),
          },
          {
            key: 'journal',
            label: '现金/银行日记账',
            children: (
              <Card className="shadow-card" extra={
                <Select value={journalAccount} style={{ width: 180 }} onChange={setJournalAccount} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              }>
                <Table rowKey={(r: any) => r.date + r.summary} columns={journalColumns} dataSource={journalData} pagination={false} size="middle"
                  summary={(page) => {
                    const last = page[page.length - 1]
                    return (<Table.Summary.Row><Table.Summary.Cell index={0} colSpan={5}>期末余额</Table.Summary.Cell><Table.Summary.Cell index={5}>{money(last?.balance ?? 0)}</Table.Summary.Cell></Table.Summary.Row>)
                  }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal title={editingAcct ? '编辑账户' : '新增账户'} open={acctModal} onOk={submitAcct} onCancel={() => setAcctModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={acctForm} layout="vertical" className="mt-3">
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}><Input placeholder="如：中国工商银行" /></Form.Item>
          <Form.Item name="type" label="账户类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'bank', label: '银行账户' }, { value: 'cash', label: '现金账户' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => getFieldValue('type') === 'bank' ? (
              <>
                <Form.Item name="bankName" label="开户银行"><Input placeholder="如：中国工商银行上海分行" /></Form.Item>
                <Form.Item name="accountNo" label="银行账号"><Input placeholder="账号" /></Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item name="glAccountCode" label="对应会计科目" rules={[{ required: true, message: '请选择对应科目（用于生成凭证）' }]}
            tooltip="收付款登记时将自动生成以该科目为主的记账凭证">
            <Select showSearch optionFilterProp="label" options={glOptions} placeholder="选择现金/银行科目" />
          </Form.Item>
          <Form.Item name="initialBalance" label="期初余额" rules={[{ required: true }]}><InputNumber className="w-full" min={0} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="登记资金流水" open={flowModal} onOk={submitFlow} onCancel={() => setFlowModal(false)} okText="保存并生成凭证" cancelText="取消" destroyOnClose>
        <Form form={flowForm} layout="vertical" className="mt-3">
          <Form.Item name="date" label="日期" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="accountId" label="资金账户" rules={[{ required: true, message: '请选择账户' }]}>
            <Select options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="type" label="收支类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'income', label: '收款' }, { value: 'expense', label: '付款' }, { value: 'transfer', label: '转账' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => {
              const t = getFieldValue('type')
              if (t === 'transfer') {
                return (
                  <Form.Item name="relatedAccountId" label="转入账户" rules={[{ required: true }]}>
                    <Select options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
                  </Form.Item>
                )
              }
              return (
                <Form.Item name="offsetAccountCode" label={t === 'income' ? '对方科目（贷方）' : '对方科目（借方）'} rules={[{ required: true, message: '请选择对方科目' }]}
                  tooltip="将自动生成凭证：收款贷记该科目 / 付款借记该科目">
                  <Select showSearch optionFilterProp="label" options={glOptions} placeholder="选择对方会计科目" />
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item name="category" label="收支类别" rules={[{ required: true }]}><Input placeholder="如：销售收入 / 办公费" /></Form.Item>
          <Form.Item name="counterparty" label="对方单位/个人"><Input /></Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><InputNumber className="w-full" min={0.01} precision={2} prefix="¥" /></Form.Item>
          <Form.Item name="summary" label="摘要" rules={[{ required: true }]}><Input placeholder="业务摘要" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
