import { db } from '@/db/database'
import { uid } from '@/utils/format'
import type { ExchangeRate } from '@/types/models'

/** 支持的外币列表（本位币 CNY 除外） */
export const FOREIGN_CURRENCIES = ['USD', 'EUR', 'HKD', 'JPY', 'GBP']

export const CURRENCY_LABEL: Record<string, string> = {
  CNY: '人民币',
  USD: '美元',
  EUR: '欧元',
  HKD: '港币',
  JPY: '日元',
  GBP: '英镑',
}

export function currencyLabel(code?: string): string {
  if (!code || code === 'CNY') return '人民币'
  return CURRENCY_LABEL[code] ?? code
}

export async function listExchangeRates(): Promise<ExchangeRate[]> {
  return db.exchangeRates.orderBy('date').reverse().toArray()
}

export async function saveExchangeRate(rate: ExchangeRate): Promise<void> {
  if (rate.id) await db.exchangeRates.put(rate)
  else await db.exchangeRates.add({ ...rate, id: uid('er_') })
}

export async function deleteExchangeRate(id: string): Promise<void> {
  await db.exchangeRates.delete(id)
}

/** 取某币种在指定日期（含）之前生效的最新汇率；本位币返回 1，无记录返回 null */
export async function getRate(currency: string, date: string): Promise<number | null> {
  if (!currency || currency === 'CNY') return 1
  const list = await db.exchangeRates.where('currency').equals(currency).sortBy('date')
  const valid = list.filter((r) => r.date <= date)
  return valid.length ? valid[valid.length - 1].rate : null
}
