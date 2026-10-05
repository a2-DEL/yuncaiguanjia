import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Empty } from 'antd'
import type { PiePoint } from '@/services/reportService'
import { formatMoney } from '@/utils/format'

const COLORS = ['#1B5FE3', '#52C41A', '#FAAD14', '#FF4D4F', '#5B5BD6', '#0EA5E9', '#D97706']

export function RatioPie({ data }: { data: PiePoint[] }) {
  if (!data.length) return <Empty description="暂无数据" />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          label={(e) => e.name}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `¥${formatMoney(v)}`} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
