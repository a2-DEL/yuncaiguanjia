import { describe, it, expect } from 'vitest'
import { parseAuditJson } from './auditAgent'

describe('auditAgent.parseAuditJson', () => {
  it('解析问题清单并过滤无凭证号的脏数据', () => {
    const raw = JSON.stringify({
      summary: '整体基本规范，有 2 处需关注',
      findings: [
        { severity: 'high', voucherNo: '记-2026-10-0003', issue: '收入挂到了预收账款', suggestion: '重分类至主营业务收入' },
        { severity: 'low', voucherNo: '记-2026-10-0007', issue: '摘要过于简略', suggestion: '补明款项用途' },
        { issue: '缺凭证号应被过滤' },
      ],
    })
    const r = parseAuditJson(raw)
    expect(r.summary).toContain('基本规范')
    expect(r.findings).toHaveLength(2)
    expect(r.findings[0].severity).toBe('high')
    expect(r.findings[1].voucherNo).toBe('记-2026-10-0007')
  })

  it('无问题时 findings 为空', () => {
    const r = parseAuditJson('{"summary":"复核通过","findings":[]}')
    expect(r.findings).toEqual([])
  })

  it('severity 缺省归为 medium', () => {
    const r = parseAuditJson('{"findings":[{"voucherNo":"V1","issue":"x"}]}')
    expect(r.findings[0].severity).toBe('medium')
  })
})
