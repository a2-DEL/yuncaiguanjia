import { useEffect, useMemo, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, TreeSelect, Tag, App as AntdApp, Space } from 'antd'
import { PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined, AppstoreOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  listAccounts,
  buildAccountTree,
  createAccount,
  updateAccount,
  toggleAccountStatus,
  type TreeNode,
} from '@/services/accountService'
import {
  ACCOUNT_TYPE_LABEL,
  type Account,
  type AccountType,
} from '@/types/models'
import { directionText } from '@/utils/format'
import { SubjectTreeSelect } from '@/components/SubjectTreeSelect'
import { FOREIGN_CURRENCIES, currencyLabel, CURRENCY_LABEL } from '@/services/exchangeRateService'
import { usePermission } from '@/hooks/usePermission'

interface TreeRow extends Account {
  children?: TreeRow[]
}

export function AccountSubjectPage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form] = Form.useForm()

  const refresh = async () => {
    setLoading(true)
    const [a, t] = await Promise.all([listAccounts(), buildAccountTree()])
    setAccounts(a)
    setTree(t)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const treeData: TreeRow[] = useMemo(() => {
    const map = new Map<string, TreeRow>()
    accounts.forEach((a) => map.set(a.code, { ...a, children: [] }))
    const roots: TreeRow[] = []
    accounts.forEach((a) => {
      const node = map.get(a.code)!
      if (a.parentCode && map.has(a.parentCode)) map.get(a.parentCode)!.children!.push(node)
      else roots.push(node)
    })
    return roots
  }, [accounts])

  const openCreate = (parent?: Account) => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      type: 'asset',
      direction: 'debit',
      status: 'active',
      parentCode: parent?.code,
    })
    setModalOpen(true)
  }

  const openEdit = (record: Account) => {
    setEditing(record)
    form.resetFields()
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      parentCode: record.parentCode,
      type: record.type,
      direction: record.direction,
      status: record.status,
      currency: record.currency ?? '',
      remark: record.remark,
    })
    setModalOpen(true)
  }

  const onTypeChange = (v: AccountType) => {
    form.setFieldsValue({ direction: v === 'asset' || v === 'cost' || v === 'profit' ? 'debit' : 'credit' })
  }

  const submit = async () => {
    const vals = await form.validateFields()
    if (editing) {
      await updateAccount(editing.code, {
        name: vals.name,
        type: vals.type,
        direction: vals.direction,
        status: vals.status,
        currency: vals.currency || undefined,
        remark: vals.remark,
      })
      message.success('科目已更新')
    } else {
      if (accounts.some((a) => a.code === vals.code)) {
        message.error('科目编码已存在')
        return
      }
      await createAccount({
        code: vals.code,
        name: vals.name,
        parentCode: vals.parentCode || null,
        type: vals.type,
        direction: vals.direction,
        status: vals.status,
        currency: vals.currency || undefined,
        remark: vals.remark,
      })
      message.success('科目已新增')
    }
    setModalOpen(false)
    refresh()
  }

  const columns: ColumnsType<TreeRow> = [
    { title: '科目编码', dataIndex: 'code', width: 120, render: (v) => <span className="tabular-nums font-medium">{v}</span> },
    { title: '科目名称', dataIndex: 'name', width: 200 },
    {
      title: '类别',
      dataIndex: 'type',
      width: 100,
      render: (t: AccountType) => <Tag color="blue">{ACCOUNT_TYPE_LABEL[t]}</Tag>,
    },
    {
      title: '余额方向',
      dataIndex: 'direction',
      width: 90,
      render: (d) => <Tag color={d === 'debit' ? 'volcano' : 'green'}>{directionText(d)}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s) => (s === 'active' ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: '币种',
      dataIndex: 'currency',
      width: 100,
      render: (c) => (c && c !== 'CNY' ? <Tag color="purple">{currencyLabel(c)}</Tag> : <span className="text-ink-400">本位币</span>),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Space size="small">
          {can('account:manage') && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            编辑
          </Button>}
          {can('account:manage') && (r.status === 'active' ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={async () => {
                await toggleAccountStatus(r.code, true)
                message.success('已停用')
                refresh()
              }}
            >
              停用
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={async () => {
                await toggleAccountStatus(r.code, false)
                message.success('已启用')
                refresh()
              }}
            >
              启用
            </Button>
          ))}
          {can('account:manage') && r.isLeaf && (
            <Button type="link" size="small" onClick={() => openCreate(r)}>
              加下级
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">会计科目体系</h1>
          <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
            依据企业会计准则构建科目树，支持多级明细、自定义新增与启用停用，凭证分录与账簿将复用此体系。
          </p>
        </div>
        {can('account:manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
          新增科目
        </Button>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {(['asset', 'liability', 'equity', 'cost', 'profit'] as AccountType[]).map((t) => (
          <Card key={t} size="small" className="shadow-card">
            <div className="flex items-center gap-2 text-ink-500 dark:text-white/55">
              <AppstoreOutlined className="text-brand-500" />
              <span className="text-[13px]">{ACCOUNT_TYPE_LABEL[t]}</span>
            </div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums text-ink-900 dark:text-white">
              {accounts.filter((a) => a.type === t).length}
            </div>
          </Card>
        ))}
      </div>

      <Card className="shadow-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="code"
          loading={loading}
          columns={columns}
          dataSource={treeData}
          pagination={false}
          size="middle"
          expandable={{ defaultExpandAllRows: true }}
        />
      </Card>

      <Modal
        title={editing ? '编辑科目' : '新增科目'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="code" label="科目编码" rules={[{ required: true, message: '请输入科目编码' }]}>
            <Input disabled={!!editing} placeholder="如 1001" />
          </Form.Item>
          <Form.Item name="name" label="科目名称" rules={[{ required: true, message: '请输入科目名称' }]}>
            <Input placeholder="如 库存现金" />
          </Form.Item>
          <Form.Item name="parentCode" label="上级科目">
            <TreeSelect
              treeData={tree}
              showSearch
              treeNodeFilterProp="title"
              allowClear
              placeholder="不填则为一级科目"
              popupMatchSelectWidth={false}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="type" label="科目类别" rules={[{ required: true }]}>
              <Select
                onChange={onTypeChange}
                options={Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
              />
            </Form.Item>
            <Form.Item name="direction" label="余额方向" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'debit', label: '借' },
                  { value: 'credit', label: '贷' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
            />
          </Form.Item>
          <Form.Item name="currency" label="核算币种">
            <Select
              allowClear
              placeholder="本位币（CNY）"
              options={[
                { value: '', label: '本位币（CNY）' },
                ...FOREIGN_CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_LABEL[c] ?? c}（${c}）` })),
              ]}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
