import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/database'
import { ROLE_PERMISSIONS, ensureRolePermissions, getRolePermissions, PERMISSION_LABELS } from '@/services/permissionService'

describe('services/permissionService 权限', () => {
  beforeEach(async () => { await db.roles.clear() })

  it('ROLE_PERMISSIONS 含全部角色且 admin 拥有 *', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('*')
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['accountant', 'admin', 'cashier', 'employee', 'finance_manager'])
  })

  it('ensureRolePermissions 写入角色并补齐权限', async () => {
    await ensureRolePermissions()
    const admin = await db.roles.get('admin')
    expect(admin?.permissions).toContain('*')
    const acc = await db.roles.get('accountant')
    expect(acc?.permissions).toContain('voucher:view')
  })

  it('getRolePermissions 实时读取 db.roles', async () => {
    await db.roles.put({ key: 'employee', name: '普通员工', permissions: ['voucher:view'] })
    const p = await getRolePermissions('employee')
    expect(p).toContain('voucher:view')
  })

  it('PERMISSION_LABELS 覆盖关键权限点', () => {
    expect(PERMISSION_LABELS['report:view']).toBeTruthy()
    expect(PERMISSION_LABELS['voucher:audit']).toBeTruthy()
  })
})
