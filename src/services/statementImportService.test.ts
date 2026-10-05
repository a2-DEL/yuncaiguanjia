import { describe, it, expect } from 'vitest'
import { parseBankCsv, parseQif, parseOfx, buildVouchersFromRows, type StatementImportOptions } from '@/services/statementImportService'
import { isBalanced } from '@/services/voucherService'

const OPTS: StatementImportOptions = {
  bankAccountCode: '1002', bankAccountName: '银行存款',
  offsetAccountCode: '6001', offsetAccountName: '主营业务收入',
}

describe('services/statementImportService 银行流水导入', () => {
  it('解析 CSV（金额列，正负号）', () => {
    const csv = '日期,摘要,金额\n2026-01-05,货款,1000\n2026-01-06,手续费,-20'
    const rows = parseBankCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].amount).toBe(1000)
    expect(rows[1].amount).toBe(-20)
  })

  it('解析 CSV（借方/贷方两列）', () => {
    const csv = '日期,摘要,借方,贷方\n2026-01-05,收款,1000,\n2026-01-06,付款,,200'
    const rows = parseBankCsv(csv)
    expect(rows[0].amount).toBe(1000)
    expect(rows[1].amount).toBe(-200)
  })

  it('解析 QIF', () => {
    const qif = '!Type:Bank\nD2026-01-05\nT100.00\nPMart\n^\nD2026-01-06\nT-50.00\nPCafe\n^'
    const rows = parseQif(qif)
    expect(rows).toHaveLength(2)
    expect(rows[0].amount).toBe(100)
    expect(rows[0].summary).toContain('Mart')
  })

  it('解析 OFX', () => {
    const ofx = '<STMTTRN><DTPOSTED>20260105120000</DTPOSTED><TRNAMT>300.00</TRNAMT><MEMO>Rent</MEMO></STMTTRN>'
    const rows = parseOfx(ofx)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-01-05')
    expect(rows[0].amount).toBe(300)
  })

  it('流水生成平衡候选凭证', () => {
    const csv = '日期,摘要,金额\n2026-01-05,货款,1000\n2026-01-06,手续费,-20'
    const rows = parseBankCsv(csv)
    const vouchers = buildVouchersFromRows(rows, OPTS)
    expect(vouchers).toHaveLength(2)
    for (const v of vouchers) {
      expect(isBalanced(v.entries)).toBe(true)
    }
    // 流入：银行借 1000 / 收入贷 1000
    expect(vouchers[0].entries.find((e) => e.debit > 0)!.accountCode).toBe('1002')
    expect(vouchers[0].entries.find((e) => e.credit > 0)!.accountCode).toBe('6001')
    // 流出：费用借 20 / 银行贷 20
    expect(vouchers[1].entries.find((e) => e.debit > 0)!.accountCode).toBe('6001')
    expect(vouchers[1].entries.find((e) => e.credit > 0)!.accountCode).toBe('1002')
  })
})
