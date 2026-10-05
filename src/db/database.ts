import Dexie, { type Table } from 'dexie'
import { applySchema, DB_NAME } from './schema'
import type {
  Account,
  Voucher,
  Attachment,
  Role,
  User,
  OperationLog,
  SystemSetting,
  BankAccount,
  CashFlow,
  Contact,
  ArApBill,
  Asset,
  DepreciationRecord,
  ExpenseClaim,
  Invoice,
  CloseRecord,
  OpeningBalance,
  Budget,
  ExchangeRate,
  Good,
  StockMove,
  VoucherVersion,
  Entity,
  Webhook,
  AiConfig,
  AgentProposal,
} from '@/types/models'

class FinanceDB extends Dexie {
  accounts!: Table<Account, string>
  vouchers!: Table<Voucher, string>
  attachments!: Table<Attachment, string>
  roles!: Table<Role, string>
  users!: Table<User, string>
  logs!: Table<OperationLog, string>
  settings!: Table<SystemSetting, string>
  // 出纳
  bankAccounts!: Table<BankAccount, string>
  cashFlows!: Table<CashFlow, string>
  // 往来
  contacts!: Table<Contact, string>
  arApBills!: Table<ArApBill, string>
  // 固定资产
  assets!: Table<Asset, string>
  depreciations!: Table<DepreciationRecord, string>
  // 费用报销
  expenseClaims!: Table<ExpenseClaim, string>
  // 税务
  invoices!: Table<Invoice, string>
  // 期末结账
  closings!: Table<CloseRecord, string>
  // 期初余额（开账）
  openingBalances!: Table<OpeningBalance, string>
  // 预算管理
  budgets!: Table<Budget, string>
  // 汇率表
  exchangeRates!: Table<ExchangeRate, string>
  // 进销存（轻量业财一体）
  goods!: Table<Good, string>
  stockMoves!: Table<StockMove, string>
  // 凭证版本快照
  voucherVersions!: Table<VoucherVersion, string>
  // 合并报表主体/账簿（多账套）
  entities!: Table<Entity, string>
  // 开放互通：Webhook 出站通知配置
  webhooks!: Table<Webhook, string>
  // AI 助手：按用户隔离的模型接入配置
  aiConfigs!: Table<AiConfig, string>
  // Agent 团队：岗位产出的待批任务
  proposals!: Table<AgentProposal, string>

  constructor() {
    super(DB_NAME)
    applySchema(this)
  }
}

export const db = new FinanceDB()
