import dayjs from 'dayjs'

/** 金额千分位格式化 */
export function formatMoney(value: number | undefined | null, digits = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  const fixed = Number(value).toFixed(digits)
  const [intPart, decPart] = fixed.split('.')
  const sign = intPart.startsWith('-') ? '-' : ''
  const absInt = sign ? intPart.slice(1) : intPart
  const withSep = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${withSep}${decPart ? '.' + decPart : ''}`
}

/** 人民币符号金额 */
export function money(value: number, digits = 2): string {
  return `¥${formatMoney(value, digits)}`
}

/** 日期格式化 */
export function formatDate(value: number | string | Date, pattern = 'YYYY-MM-DD'): string {
  return dayjs(value).format(pattern)
}

/** 当前期间 YYYY-MM */
export function currentPeriod(d = new Date()): string {
  return dayjs(d).format('YYYY-MM')
}

/** 借贷方向中文 */
export function directionText(direction: 'debit' | 'credit'): string {
  return direction === 'debit' ? '借' : '贷'
}

/** 生成简单唯一 id */
export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  )
}
