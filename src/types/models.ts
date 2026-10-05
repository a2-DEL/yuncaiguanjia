// 全局数据模型定义

export type AccountType = 'asset' | 'liability' | 'equity' | 'cost' | 'profit'
export type AccountStatus = 'active' | 'disabled'
export type VoucherStatus = 'draft' | 'pending' | 'audited' | 'void'

export interface Account {
  id: string
  code: string // 科目编码，如 1001
  name: string
  parentCode: string | null
  level: number // 1..n 层级
  type: AccountType
  direction: 'debit' | 'credit' // 余额方向
  isLeaf: boolean // 是否为末级科目（可做凭证分录）
  status: AccountStatus
  currency?: string // 核算币种（如 'USD'）；留空表示本位币 CNY
  remark?: string
}

export interface VoucherEntry {
  id: string
  summary: string // 摘要
  accountCode: string
  accountName: string
  debit: number // 借方金额（本位币）
  credit: number // 贷方金额（本位币）
  remark?: string
  currency?: string // 原币币种（外币核算科目分录时填写，如 'USD'；本位币分录留空）
  exchangeRate?: number // 汇率：1 外币 = exchangeRate 本位币
  foreignAmount?: number // 原币金额（与借贷方向同侧）
}

export interface Voucher {
  id: string
  voucherNo: string // 自动生成，如 记-2026-10-0001
  date: string // YYYY-MM-DD
  period: string // YYYY-MM
  entries: VoucherEntry[]
  status: VoucherStatus
  attachments: string[] // attachment id 列表
  creator: string
  auditor?: string
  createdAt: number
  auditedAt?: number
  remark?: string
  entityId?: string // 所属账套/主体（合并报表用）；留空视为默认总部账套
  isElimination?: boolean // 是否为集团内部抵销分录（合并时单独列示，不计入各主体试算）
}

export interface Attachment {
  id: string
  name: string
  type: string // mime
  size: number
  blob: Blob
  createdAt: number
}

export type RoleKey = 'admin' | 'finance_manager' | 'accountant' | 'cashier' | 'employee'

export interface Permission {
  key: string // 权限点，如 voucher:create
  label: string
}

export interface Role {
  key: RoleKey
  name: string
  permissions: string[]
}

export interface User {
  id: string
  name: string
  username: string
  role: RoleKey
  avatarColor: string
}

export interface OperationLog {
  id: string
  action: string // 操作类型
  module: string // 模块
  detail: string // 描述
  userId: string
  userName: string
  time: number
  hash?: string // 本记录哈希链签名（SHA-256，防篡改）
  prevHash?: string // 上一条记录哈希（链式，首条为 ''）
}

export interface SystemSetting {
  key: string
  value: string
}

// ===================== 汇率表 =====================
export interface ExchangeRate {
  id: string
  currency: string // 外币代码，如 'USD'
  date: string // YYYY-MM-DD 生效日期
  rate: number // 1 外币 = rate 本位币(CNY)
  remark?: string
}

// ===================== 进销存（轻量业财一体） =====================
export type GoodStatus = 'active' | 'disabled'

export interface Good {
  id: string
  code: string // 商品编码
  name: string // 商品名称
  spec?: string // 规格
  unit?: string // 计量单位
  category?: string // 类别
  status: GoodStatus
  remark?: string
}

export type StockMoveType = 'in' | 'out' // 入库（采购）/ 出库（销售）

export interface StockMove {
  id: string
  goodsId: string
  goodsName: string
  date: string // YYYY-MM-DD
  period: string // YYYY-MM
  type: StockMoveType
  qty: number // 数量
  price: number // 单价（本位币）
  amount: number // 金额 = qty * price
  voucherNo?: string // 关联凭证号（生成后回写）
  remark?: string
}

// ===================== 凭证版本快照（合规审计） =====================
export interface VoucherVersion {
  id: string
  voucherId: string
  version: number // 第几个版本（1 起）
  time: number // 快照时间戳
  snapshot: Voucher // 该时刻凭证完整副本
}

// ===================== 合并报表主体 / 账簿（多账套） =====================
export interface Entity {
  id: string
  name: string // 主体/账套名称，如「总部」「美国子公司」
  currency: string // 该主体记账本位币（CNY/USD/EUR…）
  parentId?: string // 集团层级父节点
  isGroup?: boolean // 是否为集团（合并）主体
}

// ===================== 开放互通：Webhook 出站通知 =====================
export interface Webhook {
  id: string
  event: string // 监听事件名，如 voucher.saved / invoice.created / *（全部）
  url: string // 回调地址（https/http）
  secret?: string // HMAC-SHA256 签名密钥（可选）
  enabled: boolean
  createdAt: number
}

// ===================== AI 助手：按用户隔离的模型接入配置 =====================
/** 厂商预设 key；custom 表示用户自填 OpenAI 兼容端点 */
export type AiProviderKey =
  | 'deepseek'
  | 'doubao'
  | 'qwen'
  | 'zhipu'
  | 'openai'
  | 'custom'

/**
 * 每个用户一套独立配置（含自己的 API Key），互不共用、各付各的费用。
 * 所有主流厂商（DeepSeek / 豆包火山方舟 / 通义千问 / 智谱GLM / OpenAI）现均提供
 * OpenAI 兼容的 /chat/completions 接口，区别仅在 baseUrl 与默认模型名，故统一客户端即可。
 */
export interface AiConfig {
  id: string // 固定为 `ai_${userId}`，一人一条
  userId: string // 归属用户
  provider: AiProviderKey
  baseUrl: string // 例如 https://api.deepseek.com/v1（不要以 / 结尾）
  apiKey: string // 仅存本机 IndexedDB，界面脱敏，不上报
  model: string // 例如 deepseek-chat / doubao-pro-4k / qwen-plus / glm-4-flash / gpt-4o-mini
  enabled: boolean
  updatedAt: number
}

// ===================== Agent 团队：岗位与待批任务 =====================
/**
 * 岗位 key：每个数字员工只精通一件事，权限严格对应岗位职责。
 * 这不是技术分类，是财务内控的"不相容职务分离"原则在 Agent 层的落地。
 */
export type AgentRoleKey =
  | 'bookkeeper'   // 记账专员：写凭证草稿
  | 'auditor'      // 审核主管：只读，挑问题，不改账
  | 'cashier'      // 出纳专员：只管资金流水
  | 'taxer'        // 税务专员：算税、提醒申报
  | 'watcher'      // 经营参谋：看全局，给老板建议
  | 'reporter'     // 报表参谋：把数字翻译成人话

/** AI 介入三档强度：全自动 / 待批(推荐) / 仅建议 */
export type AgentMode = 'auto' | 'review' | 'suggest'

/** Agent 产出的待批任务：人不批就不落库 */
export interface AgentProposal {
  id: string
  role: AgentRoleKey      // 哪个岗位提的
  kind: string            // 提议类型：voucher / warning / insight / tax_reminder ...
  title: string           // 一句话标题（老板看得懂的话）
  detail: string          // 详细说明（依据、数字、理由）
  payload?: unknown       // 结构化数据（如草稿分录、模拟参数）
  status: 'pending' | 'approved' | 'rejected'
  confidence: number      // 0-1，模型自评置信度
  createdAt: number
  decidedAt?: number
  decidedBy?: string
}

// ===================== 期末结账 =====================
export interface CloseRecord {
  period: string // YYYY-MM，作为主键
  carryForwardVoucherId?: string // 结转损益生成的凭证 id
  carried?: boolean // 损益已结转（即便无凭证，如损益余额为 0）
  yearEndVoucherId?: string // 年末本年利润结转利润分配凭证 id
  yearEndDone?: boolean // 已完成年末结转
  closedAt?: number // 结账时间（存在即为已结账）
  closedBy?: string // 结账人
}

// ===================== 期初余额（开账） =====================
export interface OpeningEntry {
  accountCode: string
  accountName: string
  debit: number // 期初借方余额
  credit: number // 期初贷方余额
}

export type OpeningSource = 'auto' | 'manual'

export interface OpeningBalance {
  id: string // 年份，如 "2026"
  year: number // 2026
  entries: OpeningEntry[]
  source: OpeningSource // auto=年末结账自动驱动；manual=手工录入（新账套启用）
  basedOnPeriod?: string // auto 时来源期间（如 "2026-12"）
  createdAt: number
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: '资产类',
  liability: '负债类',
  equity: '权益类',
  cost: '成本类',
  profit: '损益类',
}

export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  audited: '已审核',
  void: '已作废',
}

// ===================== 出纳资金管理 =====================
export type CashAccountType = 'bank' | 'cash'
export type CashFlowType = 'income' | 'expense' | 'transfer'

export interface BankAccount {
  id: string
  name: string
  type: CashAccountType
  bankName?: string
  accountNo?: string
  currency: string
  initialBalance: number
  glAccountCode?: string // 对应的会计科目编码（收付款自动生成凭证时使用）
  status: AccountStatus
  remark?: string
}

export interface CashFlow {
  id: string
  date: string
  period: string
  accountId: string
  type: CashFlowType
  category: string // 收支类别
  counterparty?: string
  amount: number
  summary: string
  relatedAccountId?: string // 转账对方账户
  reconciled: boolean
  voucherNo?: string
  createdAt: number
}

// ===================== 往来账款 =====================
export type ContactType = 'customer' | 'supplier'

export interface Contact {
  id: string
  type: ContactType
  name: string
  code: string
  phone?: string
  taxNo?: string
  address?: string
  creditLimit?: number
  remark?: string
}

export type ArApDirection = 'receivable' | 'payable'
export type ArApStatus = 'open' | 'partial' | 'closed'

export interface ArApBill {
  id: string
  direction: ArApDirection
  contactId: string
  billNo: string
  date: string
  dueDate?: string
  amount: number
  settled: number // 已收/已付金额
  status: ArApStatus
  subject: string // 业务摘要
  voucherNo?: string
  createdAt: number
  closedAt?: number
}

// ===================== 固定资产 =====================
export type AssetCategory = 'office' | 'machine' | 'vehicle' | 'building' | 'other'
export type DepreciationMethod = 'straight' | 'double'
export type AssetStatus = 'in_use' | 'idle' | 'disposed'

export interface Asset {
  id: string
  code: string
  name: string
  category: AssetCategory
  spec?: string
  department?: string
  user?: string
  originalValue: number
  salvageRate: number // 残值率 0-1
  usefulLife: number // 使用年限（月）
  depreciationMethod: DepreciationMethod
  startDate: string
  accumulatedDepreciation: number
  status: AssetStatus
  remark?: string
}

export interface DepreciationRecord {
  id: string
  assetId: string
  period: string
  amount: number
  accumulated: number
  voucherNo?: string // 计提折旧自动生成的关联凭证号
  createdAt: number
}

// ===================== 费用报销 =====================
export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'

export interface ExpenseItem {
  id: string
  category: string
  summary: string
  amount: number
  accountCode?: string
}

export interface ExpenseClaim {
  id: string
  claimNo: string
  applicant: string
  department: string
  date: string
  items: ExpenseItem[]
  total: number
  status: ExpenseStatus
  currentNode: string // 当前审核节点名称
  attachmentCount: number
  voucherNo?: string // 同步生成的凭证号
  remark?: string
  createdAt: number
  approvedAt?: number
}

// ===================== 税务管理 =====================
export type InvoiceType = 'purchase' | 'sales'
export type InvoiceStatus = 'normal' | 'cancelled'

export interface Invoice {
  id: string
  type: InvoiceType
  invoiceNo: string
  date: string
  period: string
  counterparty: string
  taxNo?: string
  amount: number // 不含税金额
  taxRate: number
  taxAmount: number
  totalAmount: number
  status: InvoiceStatus
  voucherNo?: string // 登记发票自动生成的关联凭证号
  remark?: string
}

// ===================== 标签映射 =====================
export const CASH_ACCOUNT_TYPE_LABEL: Record<CashAccountType, string> = {
  bank: '银行账户',
  cash: '现金账户',
}
export const CASH_FLOW_TYPE_LABEL: Record<CashFlowType, string> = {
  income: '收款',
  expense: '付款',
  transfer: '转账',
}
export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  customer: '客户',
  supplier: '供应商',
}
export const ARAP_DIRECTION_LABEL: Record<ArApDirection, string> = {
  receivable: '应收',
  payable: '应付',
}
export const ARAP_STATUS_LABEL: Record<ArApStatus, string> = {
  open: '未结算',
  partial: '部分结算',
  closed: '已结清',
}
export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  office: '办公设备',
  machine: '机器设备',
  vehicle: '车辆',
  building: '房屋建筑',
  other: '其他',
}
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  in_use: '使用中',
  idle: '闲置',
  disposed: '已清理',
}
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已通过',
  rejected: '已驳回',
  paid: '已支付',
}
export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  purchase: '进项发票',
  sales: '销项发票',
}
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  normal: '正常',
  cancelled: '已作废',
}

// ===================== 预算管理 =====================
export type BudgetPeriodType = 'month' | 'quarter' | 'year'

export interface Budget {
  id: string
  periodType: BudgetPeriodType
  period: string // month: YYYY-MM；quarter: YYYY-Qn；year: YYYY
  year: number
  accountCode: string
  accountName: string
  amount: number // 预算额（正数，按科目方向衡量该维度发生额目标）
  createdAt: number
  updatedAt: number
}
