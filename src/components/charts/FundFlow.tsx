import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Empty } from 'antd'
import type { FundPoint } from '@/services/reportService'
import { formatMoney } from '@/utils/format'

export function FundFlow({ data }: { data: FundPoint[] }) {
  if (!data.length) return <Empty description="暂无数据" />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1B5FE3" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#1B5FE3" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,150,170,0.15)" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }} />
        <Area type="monotone" dataKey="balance" name="资金余额" stroke="#1B5FE3" strokeWidth={2.5} fill="url(#fundGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
