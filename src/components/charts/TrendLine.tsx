import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Empty } from 'antd'
import type { TrendPoint } from '@/services/reportService'
import { formatMoney } from '@/utils/format'

export function TrendLine({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <Empty description="暂无数据" />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,150,170,0.15)" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }} />
        <Legend />
        <Line type="monotone" dataKey="revenue" name="收入" stroke="#1B5FE3" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="expense" name="支出" stroke="#FF4D4F" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
