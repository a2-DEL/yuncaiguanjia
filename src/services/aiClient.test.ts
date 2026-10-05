import { describe, it, expect } from 'vitest'
import { extractJson } from './aiClient'

describe('extractJson 从模型输出中提取 JSON', () => {
  it('解析裸 JSON 对象', () => {
    const r = extractJson('{"a":1,"b":"x"}') as { a: number; b: string }
    expect(r.a).toBe(1)
    expect(r.b).toBe('x')
  })

  it('剥掉 ```json 代码块围栏', () => {
    const text = '好的，这是凭证：\n```json\n{"summary":"发工资","entries":[]}\n```'
    const r = extractJson(text) as { summary: string; entries: unknown[] }
    expect(r.summary).toBe('发工资')
    expect(r.entries).toEqual([])
  })

  it('容忍前后多余文字，截取第一个 { 到最后一个 }', () => {
    const text = '前面一堆话 {"debit":100,"credit":100} 后面一堆话'
    const r = extractJson(text) as { debit: number }
    expect(r.debit).toBe(100)
  })

  it('无 JSON 时抛错', () => {
    expect(() => extractJson('完全没有JSON')).toThrow(/未找到 JSON/)
  })
})
