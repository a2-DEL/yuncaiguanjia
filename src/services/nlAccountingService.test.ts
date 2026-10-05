import { describe, it, expect } from 'vitest'
import { extractAmount, resolveAccount, parseNlSentence } from '@/services/nlAccountingService'
import type { Account } from '@/types/models'

const ACCOUNTS: Account[] = [
  { id: '1', code: '1001', name: '库存现金', type: 'asset', direction: 'debit', level: 1, isLeaf: true, status: 'active' },
  { id: '2', code: '1002', name: '银行存款', type: 'asset', direction: 'debit', level: 1, isLeaf: true, status: 'active' },
  { id: '3', code: '2202', name: '应付账款', type: 'liability', direction: 'credit', level: 1, isLeaf: true, status: 'active' },
  { id: '4', code: '2211', name: '应付职工薪酬', type: 'liability', direction: 'credit', level: 1, isLeaf: true, status: 'active' },
  { id: '5', code: '6001', name: '主营业务收入', type: 'profit', direction: 'credit', level: 1, isLeaf: true, status: 'active' },
  { id: '6', code: '5602', name: '管理费用', type: 'profit', direction: 'debit', level: 1, isLeaf: false, status: 'active' },
  { id: '7', code: '560201', name: '管理费用-工资', type: 'profit', direction: 'debit', level: 2, isLeaf: true, status: 'active' },
  { id: '8', code: '560202', name: '管理费用-差旅费', type: 'profit', direction: 'debit', level: 2, isLeaf: true, status: 'active' },
] as Account[]

describe('extractAmount 金额解析', () => {
  it('解析整数与小数', () => {
    expect(extractAmount('报销2000')).toBe(2000)
    expect(extractAmount('金额 3.5 万')).toBe(35000)
  })
  it('解析 万/千/百 单位', () => {
    expect(extractAmount('发工资5万')).toBe(50000)
    expect(extractAmount('收3千')).toBe(3000)
    expect(extractAmount('付 2 百')).toBe(200)
  })
  it('解析千分位', () => {
    expect(extractAmount('收入 1,200 元')).toBe(1200)
  })
  it('无金额返回 null', () => {
    expect(extractAmount('发工资')).toBeNull()
  })
})

describe('resolveAccount 科目解析', () => {
  it('按名称包含匹配末级科目', () => {
    const r = resolveAccount('银行存款', ACCOUNTS)
    expect(r.found).toBe(true)
    expect(r.code).toBe('1002')
  })
  it('未找到返回 not found', () => {
    const r = resolveAccount('不存在的科目', ACCOUNTS)
    expect(r.found).toBe(false)
  })
})

describe('parseNlSentence 业务解析', () => {
  it('发工资 -> 借应付职工薪酬 贷银行存款', () => {
    const r = parseNlSentence('发工资5万', ACCOUNTS)
    expect(r.warnings).toHaveLength(0)
    expect(r.entries).toHaveLength(2)
    const debit = r.entries.find((e) => e.debit > 0)!
    const credit = r.entries.find((e) => e.credit > 0)!
    expect(debit.accountCode).toBe('2211') // 应付职工薪酬（名称包含匹配）
    expect(debit.debit).toBe(50000)
    expect(credit.accountCode).toBe('1002')
    expect(credit.credit).toBe(50000)
  })

  it('销售收入 -> 借银行存款 贷主营业务收入', () => {
    const r = parseNlSentence('销售收入货款12万', ACCOUNTS)
    expect(r.warnings).toHaveLength(0)
    const debit = r.entries.find((e) => e.debit > 0)!
    const credit = r.entries.find((e) => e.credit > 0)!
    expect(debit.accountCode).toBe('1002')
    expect(credit.accountCode).toBe('6001')
    expect(credit.credit).toBe(120000)
  })

  it('报销差旅费 -> 借差旅费 贷库存现金', () => {
    const r = parseNlSentence('报销差旅费2000', ACCOUNTS)
    expect(r.warnings).toHaveLength(0)
    const debit = r.entries.find((e) => e.debit > 0)!
    expect(debit.accountCode).toBe('560202')
    expect(debit.debit).toBe(2000)
  })

  it('未匹配业务类型给出警告', () => {
    const r = parseNlSentence('今天天气真好', ACCOUNTS)
    expect(r.entries).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('业务类型'))).toBe(true)
  })

  it('缺失科目给出警告但产出分录', () => {
    const r = parseNlSentence('采购办公用品1000', ACCOUNTS)
    // 库存商品 未在 ACCOUNTS 中 -> 警告
    expect(r.warnings.some((w) => w.includes('库存商品'))).toBe(true)
    expect(r.entries.length).toBe(2)
  })
})
