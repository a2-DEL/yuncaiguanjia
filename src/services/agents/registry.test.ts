import { describe, it, expect } from 'vitest'
import { AGENT_ROLES, getAgentRole, AGENT_MODE_LABEL } from './registry'

describe('Agent 岗位注册中心', () => {
  it('应有 6 个岗位，覆盖老板/财务/业务三层', () => {
    expect(AGENT_ROLES.length).toBe(6)
    const keys = AGENT_ROLES.map((r) => r.key).sort()
    expect(keys).toEqual(['auditor', 'bookkeeper', 'cashier', 'reporter', 'taxer', 'watcher'])
  })

  it('审核主管必须是只读（不能改账）', () => {
    const auditor = getAgentRole('auditor')
    expect(auditor.canWrite).toBe(false)
  })

  it('税务专员必须只读（不能替用户申报）', () => {
    const taxer = getAgentRole('taxer')
    expect(taxer.canWrite).toBe(false)
  })

  it('每个岗位都要有明确的边界说明', () => {
    for (const role of AGENT_ROLES) {
      expect(role.boundary.length).toBeGreaterThan(5)
    }
  })

  it('三档强度标签齐全', () => {
    expect(Object.keys(AGENT_MODE_LABEL).sort()).toEqual(['auto', 'review', 'suggest'])
  })
})
