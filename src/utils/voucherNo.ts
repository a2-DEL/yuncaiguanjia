import { db } from '@/db/database'
import { currentPeriod } from './format'

/**
 * 凭证编号自动生成：记-{period}-{4位序号}
 * 按期间自增，读取当前期间最大号 +1，避免重复。
 */
export async function generateVoucherNo(period: string = currentPeriod()): Promise<string> {
  const prefix = `记-${period}-`
  const list = await db.vouchers
    .where('period')
    .equals(period)
    .toArray()
  let max = 0
  for (const v of list) {
    const num = parseInt(v.voucherNo.replace(prefix, ''), 10)
    if (!Number.isNaN(num) && num > max) max = num
  }
  const next = String(max + 1).padStart(4, '0')
  return `${prefix}${next}`
}
