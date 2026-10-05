import { describe, it, expect } from 'vitest'
import { parsePlainEntryRule } from './plainEntryAgent'

describe('人话记账：本地规则解析', () => {
  it('打车+微信 → 交通费', () => {
    const r = parsePlainEntryRule('昨天打车花了86，微信付的')
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(86)
    expect(r!.categoryName).toContain('交通')
    expect(r!.payMethod).toContain('微信')
  })

  it('请客户吃饭 → 业务招待费', () => {
    const r = parsePlainEntryRule('请客户吃饭花了320，刷的银行卡')
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(320)
    expect(r!.categoryName).toContain('招待')
    expect(r!.payMethod).toContain('银行')
  })

  it('买打印纸+现金 → 办公费', () => {
    const r = parsePlainEntryRule('买了2箱打印纸，320，现金')
    expect(r!.amount).toBe(320)
    expect(r!.categoryName).toContain('办公')
    expect(r!.payMethod).toContain('现金')
  })

  it('房租 → 房租物业费', () => {
    const r = parsePlainEntryRule('交了这个月房租4500，银行转账')
    expect(r!.amount).toBe(4500)
    expect(r!.categoryName).toContain('房租')
  })

  it('一万二这种中文金额也能识别', () => {
    const r = parsePlainEntryRule('发工资一共1万2，银行转账')
    expect(r!.amount).toBe(12000)
  })

  it('识别不了的返回 null（交给 LLM 兜底）', () => {
    expect(parsePlainEntryRule('今天天气不错')).toBeNull()
  })

  it('进货+未付款 → 方向 purchase，贷方挂应付', () => {
    const r = parsePlainEntryRule('从鼎盛进货5000，未付款')
    expect(r!.direction).toBe('purchase')
    expect(r!.payMethod).toContain('2202')
    expect(r!.categoryName).toContain('库存')
  })

  it('客户打款进来 → 方向 income', () => {
    const r = parsePlainEntryRule('客户转了8000到银行卡')
    expect(r!.direction).toBe('income')
    expect(r!.categoryCode).toBe('6001')
  })

  it('卖货但没收款 → 赊销 credit_sale，挂应收', () => {
    const r = parsePlainEntryRule('卖给张三10箱货5000，他还没给')
    expect(r!.direction).toBe('credit_sale')
    expect(r!.payMethod).toContain('1122')
  })
})
