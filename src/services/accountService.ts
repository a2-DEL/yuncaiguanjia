import { db } from '@/db/database'
import type { Account } from '@/types/models'
import { addLog } from './logService'

export async function listAccounts(): Promise<Account[]> {
  return db.accounts.orderBy('code').toArray()
}

export interface TreeNode {
  title: string
  value: string
  key: string
  code: string
  children?: TreeNode[]
  isLeaf: boolean
}

/** 构建科目树（用于 TreeSelect / 树形展示） */
export async function buildAccountTree(): Promise<TreeNode[]> {
  const all = await listAccounts()
  const map = new Map<string, TreeNode>()
  all.forEach((a) => {
    map.set(a.code, {
      title: `${a.code} ${a.name}`,
      value: a.code,
      key: a.code,
      code: a.code,
      isLeaf: a.isLeaf,
      children: a.isLeaf ? undefined : [],
    })
  })
  const roots: TreeNode[] = []
  all.forEach((a) => {
    const node = map.get(a.code)!
    if (a.parentCode && map.has(a.parentCode)) {
      map.get(a.parentCode)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/** 科目智能匹配：编码或名称包含关键字 */
export async function matchAccounts(keyword: string): Promise<Account[]> {
  if (!keyword) return listAccounts()
  const kw = keyword.toLowerCase()
  const all = await listAccounts()
  return all.filter(
    (a) => a.isLeaf && (a.code.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw)),
  )
}

export async function getAccount(code: string): Promise<Account | undefined> {
  return db.accounts.get(code)
}

export async function createAccount(data: Omit<Account, 'id' | 'level' | 'isLeaf' | 'status'> & { status?: Account['status'] }) {
  const parent = data.parentCode ? await db.accounts.get(data.parentCode) : null
  const level = parent ? parent.level + 1 : 1
  const account: Account = {
    id: data.code,
    code: data.code,
    name: data.name,
    parentCode: data.parentCode ?? null,
    level,
    type: data.type,
    direction: data.direction,
    isLeaf: true,
    status: data.status ?? 'active',
    remark: data.remark,
  }
  // 父级不再是末级
  if (parent && parent.isLeaf) {
    await db.accounts.update(parent.code, { isLeaf: false })
  }
  await db.accounts.add(account)
  await addLog('新增科目', '科目体系', `新增科目 ${account.code} ${account.name}`)
}

export async function updateAccount(code: string, patch: Partial<Account>) {
  await db.accounts.update(code, patch)
  await addLog('编辑科目', '科目体系', `编辑科目 ${code}`)
}

export async function toggleAccountStatus(code: string, disable: boolean) {
  await db.accounts.update(code, { status: disable ? 'disabled' : 'active' })
  await addLog(disable ? '停用科目' : '启用科目', '科目体系', `${disable ? '停用' : '启用'}科目 ${code}`)
}
