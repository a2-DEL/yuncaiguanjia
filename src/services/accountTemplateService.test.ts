import { describe, it, expect, beforeEach } from 'vitest'
import { ACCOUNT_TEMPLATES, applyTemplate } from '@/services/accountTemplateService'
import { db } from '@/db/database'

describe('services/accountTemplateService 科目模板市场', () => {
  beforeEach(async () => {
    await db.accounts.clear()
  })

  it('模板列表非空', () => {
    expect(ACCOUNT_TEMPLATES.length).toBeGreaterThan(0)
    expect(ACCOUNT_TEMPLATES[0].accounts.length).toBeGreaterThan(0)
  })

  it('应用模板新增科目，重复应用不重复新增', async () => {
    const first = await applyTemplate('retail')
    expect(first).toBe(ACCOUNT_TEMPLATES[0].accounts.length)
    const afterSecond = await applyTemplate('retail')
    expect(afterSecond).toBe(0) // 已存在，不再新增
    expect(await db.accounts.count()).toBe(ACCOUNT_TEMPLATES[0].accounts.length)
  })

  it('应用不同模板仅补齐缺失科目', async () => {
    await applyTemplate('retail')
    const before = await db.accounts.count()
    const added = await applyTemplate('service')
    // service 模板中 1001/1002/1122/2202/2211/2221/6001 已存在，仅新增 6602/6603 等缺失项
    expect(added).toBeGreaterThan(0)
    expect(await db.accounts.count()).toBe(before + added)
  })
})
