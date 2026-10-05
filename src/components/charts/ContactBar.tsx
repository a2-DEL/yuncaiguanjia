import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Empty } from 'antd'
import type { ContactPoint } from '@/services/reportService'
import { formatMoney } from '@/utils/format'

export function ContactBar({ data }: { data: ContactPoint[] }) {
  if (!data.length) return <Empty description="暂无数据" />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barGap={6}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,150,170,0.15)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }} cursor={{ fill: 'rgba(140,150,170,0.08)' }} />
        <Legend />
        <Bar dataKey="receivable" name="应收发生额" fill="#1B5FE3" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="payable" name="应付发生额" fill="#52C41A" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
