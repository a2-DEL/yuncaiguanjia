import { describe, it, expect, beforeEach } from 'vitest'
import { encryptText, decryptText } from '@/utils/crypto'
import { exportBackup, importBackup, type BackupFile } from '@/services/backupService'
import { db } from '@/db/database'

describe('utils/crypto 加解密', () => {
  it('加密后解密可还原明文', async () => {
    const plain = '{"hello":"世界","n":123}'
    const blob = await encryptText(plain, 'p@ssw0rd')
    expect(blob.salt).toBeTruthy()
    expect(blob.iv).toBeTruthy()
    expect(blob.data).toBeTruthy()
    const back = await decryptText(blob, 'p@ssw0rd')
    expect(back).toBe(plain)
  })

  it('密码错误时解密抛异常（GCM 认证失败）', async () => {
    const blob = await encryptText('secret', 'right')
    await expect(decryptText(blob, 'wrong')).rejects.toBeTruthy()
  })
})

describe('services/backupService 备份恢复', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    await db.vouchers.clear()
    await db.exchangeRates.clear()
    await db.accounts.add({ id: 'a1', code: '1001', name: '库存现金', type: 'asset', direction: 'debit', level: 1, isLeaf: true, status: 'active' } as any)
    await db.accounts.add({ id: 'a2', code: '1002', name: '银行存款', type: 'asset', direction: 'debit', level: 1, isLeaf: true, status: 'active' } as any)
    await db.vouchers.add({ id: 'v1', voucherNo: '记-1', date: '2026-01-01', period: '2026-01', entries: [], status: 'audited', creator: 'u1', createdAt: 1 } as any)
  })

  it('明文导出后再导入可还原数据', async () => {
    const file = await exportBackup()
    expect(file.encrypted).toBe(false)
    expect(file.app).toBe('finance-system')
    // 清空后导入
    await db.accounts.clear()
    await db.vouchers.clear()
    expect(await db.accounts.count()).toBe(0)
    await importBackup(file)
    expect(await db.accounts.count()).toBe(2)
    expect(await db.vouchers.count()).toBe(1)
  })

  it('加密导出用正确密码可导入，错误密码抛异常', async () => {
    const file: BackupFile = await exportBackup('secret123')
    expect(file.encrypted).toBe(true)
    await expect(importBackup(file, 'bad')).rejects.toBeTruthy()
    await importBackup(file, 'secret123')
    expect(await db.accounts.count()).toBe(2)
  })

  it('非本系统文件抛异常', async () => {
    await expect(importBackup({ app: 'other' } as any)).rejects.toThrow()
  })
})
