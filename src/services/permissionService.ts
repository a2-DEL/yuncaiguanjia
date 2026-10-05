import { db } from '@/db/database'
import type { Role, RoleKey } from '@/types/models'

/** 权威角色权限矩阵：用于初始化/补全 db.roles，并作为权限点标签来源。
 *  db.roles 为运行时唯一事实来源（可被系统设置页编辑），本矩阵仅做兜底与补齐。 */
export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  admin: ['*'],
  finance_manager: [
    'voucher:view', 'voucher:create', 'voucher:edit', 'voucher:audit', 'voucher:delete', 'voucher:export',
    'account:view', 'account:manage',
    'report:view',
    'cash:manage', 'contact:manage', 'asset:manage', 'expense:manage', 'tax:manage', 'arap:manage',
    'system:view', 'system:manage', 'opening:view', 'opening:manage',
    'budget:view', 'budget:manage',
    'log:view', 'data:manage',
  ],
  accountant: ['voucher:view', 'voucher:create', 'voucher:edit', 'voucher:audit', 'voucher:export', 'account:view', 'report:view', 'budget:view', 'log:view', 'arap:manage'],
  cashier: ['voucher:view', 'voucher:create', 'cash:manage', 'report:view', 'budget:view', 'arap:manage'],
  employee: ['expense:create', 'expense:manage', 'voucher:view'],
}

export const ROLE_NAMES: Record<RoleKey, string> = {
  admin: '超级管理员',
  finance_manager: '财务主管',
  accountant: '会计',
  cashier: '出纳',
  employee: '普通员工',
}

/** 权限点中文标签（用于角色权限矩阵展示） */
export const PERMISSION_LABELS: Record<string, string> = {
  'voucher:view': '查看凭证',
  'voucher:create': '录入凭证',
  'voucher:edit': '编辑凭证',
  'voucher:audit': '审核凭证',
  'voucher:delete': '删除凭证',
  'voucher:export': '导出凭证',
  'account:view': '查看科目',
  'account:manage': '管理科目',
  'report:view': '查看报表',
  'cash:manage': '出纳管理',
  'contact:manage': '往来管理',
  'arap:manage': '应收应付管理',
  'asset:manage': '固定资产管理',
  'expense:manage': '报销管理',
  'expense:create': '提交报销',
  'tax:manage': '税务管理',
  'system:view': '查看系统设置',
  'system:manage': '管理系统设置',
  'opening:view': '查看开账',
  'opening:manage': '开账管理',
  'budget:view': '查看预算',
  'budget:manage': '预算编制',
  'log:view': '查看操作日志',
  'data:manage': '数据管理',
}

/** 启动时确保 db.roles 拥有完整权限点（并集补齐，不覆盖用户已编辑的权限） */
export async function ensureRolePermissions() {
  for (const [key, perms] of Object.entries(ROLE_PERMISSIONS) as [RoleKey, string[]][]) {
    const existing = await db.roles.get(key)
    if (!existing) {
      await db.roles.put({ key, name: ROLE_NAMES[key], permissions: perms })
    } else {
      const merged = Array.from(new Set([...existing.permissions, ...perms]))
      if (merged.length !== existing.permissions.length) {
        await db.roles.update(key, { permissions: merged })
      }
    }
  }
}

/** 读取某角色的权限点（实时从 db.roles） */
export async function getRolePermissions(role: RoleKey): Promise<string[]> {
  const r = await db.roles.get(role)
  return r?.permissions ?? ROLE_PERMISSIONS[role] ?? []
}

/** 列出全部角色（按权威顺序） */
export async function listRoles(): Promise<Role[]> {
  const all = await db.roles.toArray()
  const order: RoleKey[] = ['admin', 'finance_manager', 'accountant', 'cashier', 'employee']
  return all.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}
