import { describe, it, expect } from 'vitest'
import { parseEntryJson } from './dataEntryAgent'

describe('dataEntryAgent.parseEntryJson', () => {
  it('识别为往来单位并抽字段', () => {
    const raw = JSON.stringify({
      kind: 'contact',
      fields: { name: '宏远科技', phone: '13800001111', creditLimit: 50000 },
      suggestion: '请去往来账款页新增客户',
    })
    const r = parseEntryJson(raw)
    expect(r.kind).toBe('contact')
    expect(r.fields.name).toBe('宏远科技')
    expect(r.fields.creditLimit).toBe(50000)
  })

  it('无法判断时归为 unknown', () => {
    const r = parseEntryJson('{"kind":"unknown","fields":{},"suggestion":"再想想"}')
    expect(r.kind).toBe('unknown')
  })

  it('非法 kind 兜底为 unknown', () => {
    const r = parseEntryJson('{"kind":"xxx","fields":{}}')
    expect(r.kind).toBe('unknown')
  })
})
