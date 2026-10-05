/**
 * 本地账号服务：注册 / 登录。
 * 密码用 SHA-256 哈希后存储（不是明文）。
 * 本地 IndexedDB 应用，哈希只是防偷看，不是真安全。
 */
import { db } from '@/db/database'
import type { User, RoleKey } from '@/types/models'
import { uid } from '@/utils/format'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export { sha256 }

export interface AuthResult {
  ok: boolean
  user?: User
  error?: string
}

/** 注册：用户名唯一，密码 ≥8 位 */
export async function register(username: string, password: string, displayName: string): Promise<AuthResult> {
  const uname = username.trim()
  if (!uname) return { ok: false, error: '请输入用户名' }
  if (!/^[a-zA-Z0-9_一-龥]{2,20}$/.test(uname)) return { ok: false, error: '用户名 2-20 位，字母/数字/中文/下划线' }
  if (password.length < 8) return { ok: false, error: '密码至少 8 位' }

  // 重名检查
  const all = await db.users.toArray()
  if (all.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
    return { ok: false, error: '用户名已被注册' }
  }

  const user: User = {
    id: uid('u_'),
    name: displayName.trim() || uname,
    username: uname,
    role: 'admin' as RoleKey, // 本地单人应用，注册即管理员
    avatarColor: '#1B5FE3',
  }
  const hash = await sha256(password)
  await db.users.add({ ...user, passwordHash: hash } as User)
  return { ok: true, user }
}

/** 登录：校验用户名+密码 */
export async function login(username: string, password: string): Promise<AuthResult> {
  const uname = username.trim()
  const all = await db.users.toArray()
  const found = all.find((u) => u.username.toLowerCase() === uname.toLowerCase())
  if (!found) return { ok: false, error: '用户名不存在' }

  // 老种子用户（u1/u2/u3）没有密码字段，默认密码 12345678
  const userWithPwd = found as User & { passwordHash?: string }
  if (!userWithPwd.passwordHash) {
    if (password !== '12345678') return { ok: false, error: '初始密码 12345678' }
    return { ok: true, user: found }
  }

  const hash = await sha256(password)
  if (hash !== userWithPwd.passwordHash) return { ok: false, error: '密码错误' }
  return { ok: true, user: found }
}
