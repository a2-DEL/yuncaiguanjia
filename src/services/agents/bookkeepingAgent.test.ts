import { describe, it, expect } from 'vitest'
import { parseBookkeepingJson } from './bookkeepingAgent'

describe('bookkeepingAgent.parseBookkeepingJson', () => {
  it('把 LLM 返回的 JSON 转成 VoucherEntry 并补 id、四舍五入', () => {
    const raw = JSON.stringify({
      summary: '发工资',
      entries: [
        { accountCode: '2211', accountName: '应付职工薪酬', debit: 50000, credit: 0 },
        { accountCode: '1002', accountName: '银行存款', debit: 0, credit: 50000 },
      ],
      warnings: [],
    })
    const r = parseBookkeepingJson(raw)
    expect(r.summary).toBe('发工资')
    expect(r.entries).toHaveLength(2)
    expect(r.entries[0].id).toBeTruthy()
    expect(r.entries[0].debit).toBe(50000)
    expect(r.entries[1].credit).toBe(50000)
  })

  it('缺省字段给 0，warnings 缺省为空', () => {
    const raw = '{"summary":"x","entries":[{"accountCode":"1001","accountName":"现金"}]}'
    const r = parseBookkeepingJson(raw)
    expect(r.entries[0].debit).toBe(0)
    expect(r.entries[0].credit).toBe(0)
    expect(r.warnings).toEqual([])
  })

  it('支持 ```json 围栏', () => {
    const raw = '```json\n{"summary":"采购","entries":[{"accountCode":"1221","accountName":"原材料","debit":1000,"credit":0},{"accountCode":"1002","accountName":"银行存款","debit":0,"credit":1000}],"warnings":["科目可能不准"]}\n```'
    const r = parseBookkeepingJson(raw)
    expect(r.entries).toHaveLength(2)
    expect(r.warnings).toContain('科目可能不准')
  })
})
