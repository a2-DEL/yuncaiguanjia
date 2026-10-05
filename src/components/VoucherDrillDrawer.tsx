import { Drawer, Table, Empty } from 'antd'
import type { CashFlowVoucherRef } from '@/services/statementService'
import { useNavigate } from 'react-router-dom'
import { formatMoney } from '@/utils/format'

/** 报表/账簿下钻：展示某行/科目的来源凭证，点击跳转凭证编辑 */
export function VoucherDrillDrawer(props: {
  title: string
  vouchers: CashFlowVoucherRef[]
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { title, vouchers, open, onClose } = props
  return (
    <Drawer title={`来源凭证 · ${title}`} placement="right" width={520} open={open} onClose={onClose}>
      {vouchers.length === 0 ? (
        <Empty description="无来源凭证" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={vouchers}
          rowClassName={() => 'cursor-pointer'}
          onRow={(r) => ({ onClick: () => { onClose(); navigate(`/voucher/edit/${r.id}`) } })}
          columns={[
            { title: '凭证号', dataIndex: 'voucherNo', width: 120 },
            { title: '日期', dataIndex: 'date', width: 100 },
            { title: '摘要', dataIndex: 'summary' },
            {
              title: '金额', dataIndex: 'amount', align: 'right', width: 110,
              render: (v: number) => (
                <span style={{ color: v >= 0 ? '#0E9F6E' : '#E5484D' }}>
                  {v >= 0 ? '+' : ''}{formatMoney(v)}
                </span>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  )
}
