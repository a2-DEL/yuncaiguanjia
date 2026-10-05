import { useEffect, useMemo, useState } from 'react'
import { db } from '@/db/database'
import { useUserStore } from '@/store/userStore'
import type { RoleKey } from '@/types/models'

/** 读取当前登录用户角色的权限集，并提供 can / canAny 判定 */
export function usePermission() {
  const role = useUserStore((s) => s.currentUser?.role) as RoleKey | undefined
  const [perms, setPerms] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    if (role) {
      db.roles.get(role).then((r) => {
        if (!active) return
        setPerms(r?.permissions ?? [])
        setReady(true)
      })
    } else {
      setPerms([])
      setReady(true)
    }
    return () => {
      active = false
    }
  }, [role])

  const can = useMemo(
    () => (key: string) => perms.includes('*') || perms.includes(key),
    [perms],
  )
  const canAny = useMemo(
    () => (keys: string[]) => perms.includes('*') || keys.some((k) => perms.includes(k)),
    [perms],
  )

  return { can, canAny, perms, role, ready }
}
