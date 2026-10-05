import type { ReactNode } from 'react'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { formatMoney } from '@/utils/format'

interface Props {
  title: string
  value: number
  icon: ReactNode
  color: string
  prefix?: string
  trend?: number // 同比/环比，正为涨
  trendLabel?: string
  suffix?: string
}

export function StatCard({ title, value, icon, color, prefix = '¥', trend, trendLabel, suffix }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-black/[0.04] bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover dark:border-white/10 dark:bg-[#16181d]">
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-medium text-ink-500 dark:text-white/55">{title}</div>
          <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-ink-900 dark:text-white">
            {prefix}
            {formatMoney(value)}
            {suffix}
          </div>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[20px] text-white shadow-sm"
          style={{ background: color }}
        >
          {icon}
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-[12px]">
          <span
            className={
              trend >= 0
                ? 'flex items-center gap-0.5 text-[#52C41A]'
                : 'flex items-center gap-0.5 text-[#FF4D4F]'
            }
          >
            {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-ink-500 dark:text-white/45">{trendLabel ?? '较上月'}</span>
        </div>
      )}
    </div>
  )
}
