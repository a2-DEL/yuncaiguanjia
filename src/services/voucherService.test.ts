import { describe, it, expect, beforeEach } from 'vitest'
import { saveVoucher, updateVoucher, auditVoucher, snapshotVoucher, getVoucherVersions, restoreVoucherVersion, getVoucher } from '@/services/voucherService'
import { db } from '@/db/database'

describe('services/voucherService 凭证版本快照', () => {
  beforeEach(async () => {
    await db.vouchers.clear()
    await db.voucherVersions.clear()
  })

  it('编辑/审核前自动生成版本快照', async () => {
    const v = await saveVoucher({
      date: '2026-01-01', entries: [{ id: 'e1', summary: 's', accountCode: '1002', accountName: '银行存款', debit: 100, credit: 0 }, { id: 'e2', summary: 's', accountCode: '6001', accountName: '主营业务收入', debit: 0, credit: 100 }],
      creator: 'u1',
    })
    // 编辑前快照
    await updateVoucher(v.id, { remark: 'edit1' })
    // 审核前快照
    await auditVoucher(v.id)
    const versions = await getVoucherVersions(v.id)
    expect(versions.length).toBe(2)
    expect(versions[0].version).toBe(1)
    expect(versions[1].version).toBe(2)
    // 第一个快照应为编辑前的原始状态（无 remark）
    expect(versions[0].snapshot.remark).toBeUndefined()
  })

  it('手动快照返回递增版本', async () => {
    const v = await saveVoucher({ date: '2026-01-01', entries: [], creator: 'u1' })
    await snapshotVoucher(v.id)
    await snapshotVoucher(v.id)
    const versions = await getVoucherVersions(v.id)
    expect(versions.map((x) => x.version)).toEqual([1, 2])
  })

  it('恢复到历史版本会保留当前快照并覆盖正文', async () => {
    const v = await saveVoucher({ date: '2026-01-01', entries: [], creator: 'u1', remark: '初版' })
    await updateVoucher(v.id, { remark: '改后' })
    const versions = await getVoucherVersions(v.id)
    expect(versions.length).toBe(1)
    // 恢复到第 1 版（初版 remark）
    await restoreVoucherVersion(versions[0].id)
    const restored = await getVoucher(v.id)
    expect(restored?.remark).toBe('初版')
    // 恢复操作本身会再生成一个快照（保存恢复前的状态）
    const after = await getVoucherVersions(v.id)
    expect(after.length).toBe(2)
  })
})
