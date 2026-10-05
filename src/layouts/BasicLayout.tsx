import { useEffect, useMemo, useState } from 'react'
import {
  Layout, Menu, Avatar, Dropdown, Input, Badge, App as AntdApp, Tooltip, Modal, Popover, Empty, List, Tag,
} from 'antd'
import {
  DashboardOutlined,
  FileTextOutlined,
  BookOutlined,
  BankOutlined,
  SwapOutlined,
  FundOutlined,
  ToolOutlined,
  PieChartOutlined,
  AuditOutlined,
  FileDoneOutlined,
  BarChartOutlined,
  SettingOutlined,
  FileSearchOutlined,
  AppstoreOutlined,
  BellOutlined,
  ThunderboltOutlined,
  ImportOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  UserSwitchOutlined,
  DatabaseOutlined,
  SearchOutlined,
  ApiOutlined,
  TransactionOutlined,
  RobotOutlined,
  CrownOutlined,
  EditOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { useUserStore } from '@/store/userStore'
import { db } from '@/db/database'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { usePermission } from '@/hooks/usePermission'
import { ROLE_NAMES } from '@/services/permissionService'
import { getBudgetComparison, type BudgetRow } from '@/services/budgetService'
import { currentPeriod, formatMoney } from '@/utils/format'
import type { Account, Contact, RoleKey, Voucher } from '@/types/models'

const { Sider, Header, Content } = Layout

/** 路由 -> 访问所需权限点（任一满足即可） */
const ROUTE_ACCESS: Record<string, string[]> = {
  '/boss': ['report:view'],
  '/quick': ['voucher:create', 'expense:create'],
  '/workbench': ['voucher:view', 'voucher:create', 'report:view'],
  '/voucher': ['voucher:view', 'voucher:create'],
  '/ai': ['voucher:create', 'voucher:view'],
  '/inventory': ['asset:manage', 'voucher:create'],
  '/cash': ['cash:manage'],
  '/contact': ['contact:manage'],
  '/arap': ['arap:manage', 'contact:manage'],
  '/asset': ['asset:manage'],
  '/expense': ['expense:manage', 'expense:create'],
  '/tax': ['tax:manage'],
  '/report': ['report:view'],
  '/analytics': ['report:view'],
  '/report/consolidation': ['report:view'],
  '/report/compare': ['report:view'],
  '/system/integration': ['system:manage'],
  '/system/ai': ['system:manage', 'voucher:create'],
  '/ledger': ['report:view'],
  '/closing': ['report:view'],
  '/settings/account-subject': ['account:view', 'account:manage'],
  '/system': ['system:view', 'system:manage'],
  '/system/backup': ['system:view', 'system:manage'],
  '/system/statement-import': ['system:view', 'system:manage'],
  '/system/templates': ['system:view', 'system:manage'],
  '/opening': ['opening:view', 'opening:manage'],
  '/budget': ['budget:view', 'budget:manage'],
  '/log': ['log:view', 'system:view'],
}

export function BasicLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const collapsed = useAppStore((s) => s.collapsed)
  const setCollapsed = useAppStore((s) => s.setCollapsed)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const logout = useUserStore((s) => s.logout)
  const { message } = AntdApp.useApp()
  const { canAny, ready } = usePermission()

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<{ vouchers: Voucher[]; accounts: Account[]; contacts: Contact[] }>({
    vouchers: [], accounts: [], contacts: [],
  })
  const [alertRows, setAlertRows] = useState<BudgetRow[]>([])
  const [bellOpen, setBellOpen] = useState(false)

  useEffect(() => {
    if (!currentUser) {
      db.users.get('u1').then((u) => u && setCurrentUser(u))
    }
  }, [currentUser, setCurrentUser])

  // 顶栏消息提醒：当前账期预算超支科目明细
  useEffect(() => {
    getBudgetComparison({ periodType: 'month', period: currentPeriod(), year: Number(currentPeriod().split('-')[0]) })
      .then((rows) => setAlertRows(rows))
      .catch(() => setAlertRows([]))
  }, [])
  const alertCount = alertRows.filter((r) => r.status === 'over').length

  // 权限不足时拦截导航
  const path = location.pathname
  useEffect(() => {
    if (!ready) return
    const req = ROUTE_ACCESS[path]
    if (req && !canAny(req)) {
      message.warning('当前账号无权限访问该模块，已返回工作台')
      navigate('/dashboard', { replace: true })
    }
  }, [path, ready, canAny, message, navigate])

  const accessible = (key: string) => {
    if (!ready) return true // 加载期间先全部展示，避免闪烁
    const req = ROUTE_ACCESS[key]
    return !req || canAny(req)
  }

  const rawMenu = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/boss', icon: <CrownOutlined />, label: '老板驾驶舱' },
    { key: '/quick', icon: <EditOutlined />, label: '说一句就记账' },
    { key: '/workbench', icon: <TeamOutlined />, label: '财务工作台' },
    { key: '/voucher', icon: <FileTextOutlined />, label: '凭证管理' },
    { key: '/ai', icon: <ThunderboltOutlined />, label: '智能记账' },
    {
      type: 'group' as const,
      key: 'g-biz',
      label: '财务业务',
      children: [
        { key: '/cash', icon: <BankOutlined />, label: '出纳管理' },
        { key: '/contact', icon: <SwapOutlined />, label: '往来账款' },
        { key: '/arap', icon: <TransactionOutlined />, label: '应收应付' },
        { key: '/asset', icon: <FundOutlined />, label: '固定资产' },
        { key: '/expense', icon: <FileDoneOutlined />, label: '费用报销' },
        { key: '/inventory', icon: <ImportOutlined />, label: '进销存' },
      ],
    },
    {
      type: 'group' as const,
      key: 'g-report',
      label: '报表与税务',
      children: [
        { key: '/report', icon: <AuditOutlined />, label: '报表中心' },
        { key: '/report/compare', icon: <BarChartOutlined />, label: '报表对比' },
        { key: '/ledger', icon: <BookOutlined />, label: '账簿查询' },
        { key: '/closing', icon: <FileDoneOutlined />, label: '期末结账' },
        { key: '/tax', icon: <ToolOutlined />, label: '税务管理' },
        { key: '/budget', icon: <PieChartOutlined />, label: '预算与分析' },
        { key: '/analytics', icon: <BarChartOutlined />, label: '经营驾驶舱' },
        { key: '/report/consolidation', icon: <BankOutlined />, label: '集团合并报表' },
      ],
    },
    { key: '/settings/account-subject', icon: <BookOutlined />, label: '会计科目' },
    { key: '/system/exchange-rate', icon: <SwapOutlined />, label: '汇率表' },
    { key: '/opening', icon: <DatabaseOutlined />, label: '初始化 / 开账' },
    { key: '/system', icon: <SettingOutlined />, label: '系统设置' },
    { key: '/system/backup', icon: <DatabaseOutlined />, label: '数据备份' },
    { key: '/system/statement-import', icon: <ImportOutlined />, label: '银行流水导入' },
    { key: '/system/templates', icon: <AppstoreOutlined />, label: '科目模板' },
    { key: '/system/integration', icon: <ApiOutlined />, label: '开放互通' },
    { key: '/system/ai', icon: <RobotOutlined />, label: 'AI 助手配置' },
    { key: '/log', icon: <FileSearchOutlined />, label: '操作日志' },
  ]

  const menuItems = useMemo(() => {
    return rawMenu
      .filter((it: any) => (it as any).type === 'group' ? true : accessible(it.key))
      .map((it: any) =>
        (it as any).type === 'group'
          ? { ...it, children: it.children.filter((c: any) => accessible(c.key)) }
          : it,
      )
      .filter((it: any) => (it as any).type !== 'group' || (it.children && it.children.length > 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canAny])

  const switchUser = async (id: string) => {
    const u = await db.users.get(id)
    if (u) {
      setCurrentUser(u)
      message.success(`已切换为 ${u.name}`)
    }
  }

  const userMenu = {
    items: [
      { key: 'role', type: 'group' as const, label: '切换身份（演示）' },
      { key: 'u1', icon: <UserSwitchOutlined />, label: '张明（管理员）' },
      { key: 'u2', icon: <UserSwitchOutlined />, label: '李静（会计）' },
      { key: 'u3', icon: <UserSwitchOutlined />, label: '王芳（出纳）' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        logout()
        message.info('已退出（演示环境将自动以管理员重新进入）')
        db.users.get('u1').then((u) => u && setCurrentUser(u))
      } else if (key.startsWith('u')) {
        switchUser(key)
      }
    },
  }

  const selectedKey = path.startsWith('/workbench')
    ? '/workbench'
    : path.startsWith('/quick')
    ? '/quick'
    : path.startsWith('/boss')
    ? '/boss'
    : path.startsWith('/ai')
    ? '/ai'
    : path.startsWith('/voucher')
      ? '/voucher'
      : path.startsWith('/cash')
      ? '/cash'
      : path.startsWith('/contact')
        ? '/contact'
        : path.startsWith('/asset')
          ? '/asset'
          : path.startsWith('/inventory')
            ? '/inventory'
            : path.startsWith('/expense')
            ? '/expense'
            : path.startsWith('/tax')
              ? '/tax'
              : path.startsWith('/report')
                ? '/report'
                : path.startsWith('/ledger')
                  ? '/ledger'
                  : path.startsWith('/closing')
                    ? '/closing'
                    : path.startsWith('/settings/account-subject')
                      ? '/settings/account-subject'
                      : path.startsWith('/system')
                        ? '/system'
                        : path.startsWith('/opening')
                          ? '/opening'
                          : path.startsWith('/budget')
                            ? '/budget'
                            : path.startsWith('/analytics')
                              ? '/analytics'
                              : path.startsWith('/log')
                              ? '/log'
                              : '/dashboard'

  const doSearch = async (v: string) => {
    const kw = v.trim().toLowerCase()
    if (!kw) return
    setSearchKeyword(v.trim())
    setSearchLoading(true)
    setSearchOpen(true)
    const [vouchers, accounts, contacts] = await Promise.all([
      db.vouchers
        .filter((x) => x.voucherNo.toLowerCase().includes(kw) || x.entries.some((e) => e.summary.toLowerCase().includes(kw) || e.accountName.toLowerCase().includes(kw)))
        .toArray(),
      db.accounts.filter((a) => a.code.includes(kw) || a.name.toLowerCase().includes(kw)).toArray(),
      db.contacts.filter((c) => c.name.toLowerCase().includes(kw) || (c.code || '').toLowerCase().includes(kw)).toArray(),
    ])
    setSearchResults({
      vouchers: vouchers.slice(0, 10),
      accounts: accounts.slice(0, 10),
      contacts: contacts.slice(0, 10),
    })
    setSearchLoading(false)
  }

  const goSearch = (to: string) => {
    setSearchOpen(false)
    navigate(to)
  }

  return (
    <Layout className="min-h-screen">
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={232}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
      >
        <div className="flex h-16 items-center gap-2.5 px-4 shrink-0">
          <img src="/logo.svg" alt="logo" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-white">云财管家</div>
              <div className="text-[11px] text-white/45">企业财务管理系统</div>
            </div>
          )}
        </div>
        <div style={{ height: 'calc(100vh - 64px)', overflowY: 'auto' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="!bg-transparent"
        />
        </div>
      </Sider>

      <Layout>
        <Header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-black/[0.06] bg-white/90 px-5 backdrop-blur-md dark:border-white/10 dark:bg-[#16181d]/90">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-black/[0.04] dark:text-white/80 dark:hover:bg-white/10"
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <Input.Search
              placeholder="搜索凭证 / 科目 / 客户"
              allowClear
              className="w-64"
              onSearch={doSearch}
            />
          </div>
          <div className="flex items-center gap-2">
            <Popover
              open={bellOpen}
              onOpenChange={setBellOpen}
              trigger="click"
              placement="bottomRight"
              title={`消息提醒（${currentPeriod()}）`}
              content={
                <div style={{ width: 300 }}>
                  {alertCount === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span className="text-[12px] text-ink-400">本期待办，暂无预算超支</span>}
                    />
                  ) : (
                    <List
                      size="small"
                      dataSource={alertRows.filter((r) => r.status === 'over')}
                      renderItem={(r) => (
                        <List.Item
                          className="cursor-pointer"
                          onClick={() => { setBellOpen(false); navigate('/budget') }}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-ink-900 dark:text-white">
                              {r.accountCode} {r.accountName}
                            </div>
                            <div className="text-[12px] text-ink-500 dark:text-white/50">
                              预算 {formatMoney(r.amount)} / 实际 {formatMoney(r.actual)}
                            </div>
                          </div>
                          <Tag color="red" className="ml-2 shrink-0">
                            超 {formatMoney(-r.variance)}
                          </Tag>
                        </List.Item>
                      )}
                    />
                  )}
                  {alertCount > 0 && (
                    <ButtonIconText onClick={() => { setBellOpen(false); navigate('/budget') }}>
                      前往预算与分析处理 →
                    </ButtonIconText>
                  )}
                </div>
              }
            >
              <Tooltip title={alertCount > 0 ? `有 ${alertCount} 个科目预算超支` : '消息提醒'}>
                <Badge count={currentUser ? alertCount : 0} size="small">
                  <ButtonIcon>
                    <BellOutlined />
                  </ButtonIcon>
                </Badge>
              </Tooltip>
            </Popover>
            <ThemeSwitch />
            <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
              <div className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/10">
                <Avatar style={{ backgroundColor: currentUser?.avatarColor ?? '#1B5FE3' }}>
                  {currentUser?.name?.[0] ?? 'U'}
                </Avatar>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium text-ink-900 dark:text-white">
                    {currentUser?.name ?? '未登录'}
                  </div>
                  <div className="text-[11px] text-ink-500 dark:text-white/45">
                    {currentUser ? (ROLE_NAMES[currentUser.role as RoleKey] ?? currentUser.role) : '--'}
                  </div>
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="p-5 lg:p-6">
          <div className="animate-fade-up">
            <Outlet />
          </div>
        </Content>
      </Layout>

      <Modal
        title={<span><SearchOutlined className="mr-1" />搜索结果：{searchKeyword}</span>}
        open={searchOpen}
        onCancel={() => setSearchOpen(false)}
        footer={null}
        width={560}
      >
        {searchLoading ? (
          <div className="py-8 text-center text-ink-500">搜索中…</div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-auto">
            <SearchSection title="记账凭证" empty={searchResults.vouchers.length === 0} onMore={() => goSearch('/voucher')}>
              {searchResults.vouchers.map((v) => (
                <SearchRow key={v.id} text={`${v.voucherNo} · ${v.entries[0]?.summary ?? ''}`} onClick={() => goSearch(`/voucher/edit/${v.id}`)} />
              ))}
            </SearchSection>
            <SearchSection title="会计科目" empty={searchResults.accounts.length === 0} onMore={() => goSearch('/settings/account-subject')}>
              {searchResults.accounts.map((a) => (
                <SearchRow key={a.id} text={`${a.code} ${a.name}`} onClick={() => goSearch('/settings/account-subject')} />
              ))}
            </SearchSection>
            <SearchSection title="往来单位" empty={searchResults.contacts.length === 0} onMore={() => goSearch('/contact')}>
              {searchResults.contacts.map((c) => (
                <SearchRow key={c.id} text={`${c.name}（${c.type === 'customer' ? '客户' : '供应商'}）`} onClick={() => goSearch('/contact')} />
              ))}
            </SearchSection>
          </div>
        )}
      </Modal>
    </Layout>
  )
}

function SearchSection({ title, empty, onMore, children }: { title: string; empty: boolean; onMore: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-medium text-ink-700 dark:text-white/80">{title}</div>
        <ButtonIconText onClick={onMore}>查看全部</ButtonIconText>
      </div>
      {empty ? (
        <div className="py-2 text-[12px] text-ink-400">无匹配</div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  )
}

function SearchRow({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-md px-2 py-1.5 text-[13px] text-ink-700 transition-colors hover:bg-black/[0.04] dark:text-white/80 dark:hover:bg-white/10"
    >
      {text}
    </div>
  )
}

function ButtonIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg text-[16px] text-ink-700 transition-colors hover:bg-black/[0.04] dark:text-white/80 dark:hover:bg-white/10">
      {children}
    </span>
  )
}

function ButtonIconText({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      className="cursor-pointer text-[12px] text-brand-600 hover:underline dark:text-brand-300"
    >
      {children}
    </span>
  )
}
