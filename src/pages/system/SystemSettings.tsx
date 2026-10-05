import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, Tag, App as AntdApp,
  Space, Checkbox, Alert, Popconfirm, Upload,
} from 'antd'
import { PlusOutlined, DeleteOutlined, SafetyOutlined, DatabaseOutlined, DownloadOutlined, ImportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { db } from '@/db/database'
import { useUserStore } from '@/store/userStore'
import { usePermission } from '@/hooks/usePermission'
import {
  ROLE_NAMES, PERMISSION_LABELS, listRoles,
} from '@/services/permissionService'
import type { Role, RoleKey, User } from '@/types/models'
import { seedDemoData } from '@/db/demoData'
import { sha256 } from '@/services/authService'

const ALL_PERMS = Object.keys(PERMISSION_LABELS)

const ROLE_COLORS: Record<RoleKey, string> = {
  admin: 'red',
  finance_manager: 'gold',
  accountant: 'blue',
  cashier: 'green',
  employee: 'default',
}

export function SystemSettingsPage() {
  const { message } = AntdApp.useApp()
  const { can } = usePermission()
  const canManage = can('system:manage')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">系统设置</h1>
        <p className="mt-1 text-[13px] text-ink-500 dark:text-white/50">
          用户账号与角色权限管理。权限以「角色」为单元分配，修改后即时生效；切换身份可在右上角头像菜单体验。
        </p>
      </div>

      {!canManage && (
        <Alert type="info" showIcon message="当前账号仅有查看权限，编辑功能已隐藏（需 system:manage 权限）。" />
      )}

      <Tabs defaultActiveKey="user" items={[
        { key: 'user', label: '用户管理', children: <UserTab canManage={canManage} /> },
        { key: 'role', label: '角色权限', children: <RoleTab canManage={canManage} /> },
        { key: 'demo', label: '演示数据', children: <DemoTab canManage={canManage} /> },
      ]} />
    </div>
  )
}

function DemoTab({ canManage }: { canManage: boolean }) {
  const { message } = AntdApp.useApp()
  const [loading, setLoading] = useState(false)
  async function onSeed() {
    setLoading(true)
    try {
      await seedDemoData()
      message.success('演示数据已灌入，去老板驾驶舱看看')
    } catch (e: any) {
      message.error(e.message ?? '失败')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Card title="演示数据" className="shadow-card">
      <p style={{ color: '#666' }}>
        灌入一个小超市 2 个月的真实感流水：银行账户、5 家往来单位、18 张已审核凭证、3 张应收应付单。
        灌完后老板驾驶舱、报表、风险预警、What-If 沙盘全都有数据可看。
      </p>
      <Button type="primary" loading={loading} disabled={!canManage} onClick={onSeed}>
        一键灌入演示数据
      </Button>
    </Card>
  )
}

function UserTab({ canManage }: { canManage: boolean }) {
  const { message } = AntdApp.useApp()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const [users, setUsers] = useState<User[]>([])
  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()

  const load = async () => setUsers(await db.users.toArray())
  useEffect(() => { load() }, [])

  const changeRole = async (id: string, role: RoleKey) => {
    await db.users.update(id, { role })
    if (currentUser?.id === id) {
      const u = await db.users.get(id)
      if (u) setCurrentUser(u)
    }
    message.success('已更新用户角色'); load()
  }

  const removeUser = async (id: string) => {
    if (currentUser?.id === id) { message.warning('不能删除当前登录账号'); return }
    await db.users.delete(id)
    message.success('已删除'); load()
  }

  const submit = async () => {
    const v = await form.validateFields()
    const id = `u${Date.now().toString().slice(-6)}`
    const colors = ['#1B5FE3', '#0E9F6E', '#FAAD14', '#FF4D4F', '#722ED1']
    const hash = await sha256(v.password || '12345678')
    await db.users.add({
      id, name: v.name, username: v.username, role: v.role,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      passwordHash: hash,
    } as any)
    message.success(`用户已创建，初始密码：${v.password || '12345678'}`); setModal(false); load()
  }

  const columns = [
    { title: '姓名', dataIndex: 'name', render: (t: string) => <span className="font-medium">{t}</span> },
    { title: '用户名', dataIndex: 'username' },
    {
      title: '角色', dataIndex: 'role', render: (r: RoleKey, row: User) => canManage ? (
        <Select
          value={r}
          style={{ width: 130 }}
          onChange={(val) => changeRole(row.id, val)}
          options={Object.entries(ROLE_NAMES).map(([k, v]) => ({ value: k, label: v }))}
        />
      ) : (
        <Tag color={ROLE_COLORS[r]}>{ROLE_NAMES[r]}</Tag>
      ),
    },
    {
      title: '操作', key: 'op', render: (_: any, row: User) => (
        <Popconfirm title="确认删除该用户？" onConfirm={() => removeUser(row.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!canManage || currentUser?.id === row.id}>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <Card className="shadow-card" extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ role: 'employee' }); setModal(true) }}>新增用户</Button>}>
      <Table rowKey="id" columns={columns} dataSource={users} pagination={false} size="middle" />
      <Modal title="新增用户" open={modal} onOk={submit} onCancel={() => setModal(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input placeholder="如 赵磊" /></Form.Item>
          <Form.Item name="username" label="登录账号" rules={[{ required: true }]}><Input placeholder="如 zhaolei" /></Form.Item>
          <Form.Item name="password" label="初始密码（至少 8 位）" initialValue="12345678"><Input.Password placeholder="默认 12345678" /></Form.Item>
          <Form.Item name="role" label="分配角色（决定他能看什么、做什么）" rules={[{ required: true }]}><Select options={Object.entries(ROLE_NAMES).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

function RoleTab({ canManage }: { canManage: boolean }) {
  const { message } = AntdApp.useApp()
  const [roles, setRoles] = useState<Role[]>([])

  const load = async () => setRoles(await listRoles())
  useEffect(() => { load() }, [])

  const togglePerm = async (roleKey: RoleKey, perm: string, checked: boolean) => {
    if (roleKey === 'admin') return
    const role = roles.find((r) => r.key === roleKey)
    if (!role) return
    const set = new Set(role.permissions)
    if (checked) set.add(perm); else set.delete(perm)
    const next = Array.from(set)
    await db.roles.update(roleKey, { permissions: next })
    message.success('权限已更新'); load()
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {roles.map((role) => {
        const isAdmin = role.key === 'admin'
        const checked = isAdmin ? ALL_PERMS : role.permissions
        return (
          <Card
            key={role.key}
            className="shadow-card"
            title={
              <Space>
                <SafetyOutlined />
                <span>{ROLE_NAMES[role.key]}</span>
                <Tag color={ROLE_COLORS[role.key]}>{role.key}</Tag>
              </Space>
            }
          >
            {isAdmin && <Alert type="warning" showIcon className="mb-3" message="超级管理员拥有全部权限（*），不可编辑。" />}
            <Checkbox.Group
              value={checked}
              disabled={!canManage || isAdmin}
              onChange={(vals) => {
                // 逐条同步（Checkbox.Group 整体变更，这里做差量更新）
                const next = vals as string[]
                ALL_PERMS.forEach((p) => {
                  const has = role.permissions.includes(p)
                  const want = next.includes(p)
                  if (has !== want) togglePerm(role.key, p, want)
                })
              }}
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {ALL_PERMS.map((p) => (
                  <Checkbox key={p} value={p}>{PERMISSION_LABELS[p]}</Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          </Card>
        )
      })}
    </div>
  )
}
