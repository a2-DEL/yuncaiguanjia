import type { VoucherEntry } from '@/types/models'
import { uid } from '@/utils/format'

/** 银行流水单行（amount 为带符号金额：正=流入/借银行，负=流出/贷银行） */
export interface BankStatementRow {
  date: string // YYYY-MM-DD
  summary: string
  amount: number
}

export interface StatementImportOptions {
  bankAccountCode: string
  bankAccountName: string
  offsetAccountCode: string // 对方科目（流入贷方 / 流出借方）
  offsetAccountName: string
}

export interface CandidateVoucher {
  date: string
  summary: string
  entries: VoucherEntry[]
}

/** 解析 CSV 银行流水（支持表头；列：日期,摘要,金额 或 日期,摘要,借方,贷方） */
export function parseBankCsv(text: string): BankStatementRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const rows: BankStatementRow[] = []
  let start = 0
  const header = lines[0].toLowerCase()
  if (header.includes('日期') || header.includes('date')) start = 1
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const date = (cols[0] || '').trim()
    const summary = (cols[1] || '').trim()
    let amount = 0
    if (cols.length >= 4 && (cols[2] || cols[3])) {
      const debit = parseFloat(cols[2]) || 0
      const credit = parseFloat(cols[3]) || 0
      amount = debit - credit
    } else {
      amount = parseFloat(cols[2]) || 0
    }
    if (!date || Number.isNaN(amount)) continue
    rows.push({ date, summary: summary || '银行流水', amount: Math.round(amount * 100) / 100 })
  }
  return rows
}

/** 解析 QIF 银行流水 */
export function parseQif(text: string): BankStatementRow[] {
  const rows: BankStatementRow[] = []
  const blocks = text.split('^').map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    let date = ''
    let summary = ''
    let amount = 0
    for (const line of block.split(/\r?\n/)) {
      const tag = line[0]
      const val = line.slice(1)
      if (tag === 'D') date = normalizeDate(val)
      else if (tag === 'T') amount = parseFloat(val) || 0
      else if (tag === 'P' || tag === 'M') summary = (summary ? summary + ' ' : '') + val
    }
    if (date && !Number.isNaN(amount)) rows.push({ date, summary: summary || '银行流水', amount: Math.round(amount * 100) / 100 })
  }
  return rows
}

/** 解析 OFX 银行流水（简易正则，无需 XML 解析库） */
export function parseOfx(text: string): BankStatementRow[] {
  const rows: BankStatementRow[] = []
  const trn = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g) || []
  for (const t of trn) {
    const dateM = t.match(/<DTPOSTED>(\d{8})/)
    const amtM = t.match(/<TRNAMT>([-\d.]+)/)
    const memoM = t.match(/<MEMO>([^<]*)</)
    if (!dateM || !amtM) continue
    const raw = dateM[1]
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    rows.push({ date, summary: memoM ? memoM[1].trim() : '银行流水', amount: Math.round(parseFloat(amtM[1]) * 100) / 100 })
  }
  return rows
}

function normalizeDate(s: string): string {
  const m = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s
}

/** 将流水行转换为候选凭证（银行科目单边 + 对方科目，自动平衡） */
export function buildVouchersFromRows(rows: BankStatementRow[], opts: StatementImportOptions): CandidateVoucher[] {
  return rows.map((r) => {
    const entries: VoucherEntry[] = []
    if (r.amount >= 0) {
      entries.push({ id: uid('e_'), summary: r.summary, accountCode: opts.bankAccountCode, accountName: opts.bankAccountName, debit: r.amount, credit: 0 })
      entries.push({ id: uid('e_'), summary: r.summary, accountCode: opts.offsetAccountCode, accountName: opts.offsetAccountName, debit: 0, credit: r.amount })
    } else {
      const abs = -r.amount
      entries.push({ id: uid('e_'), summary: r.summary, accountCode: opts.offsetAccountCode, accountName: opts.offsetAccountName, debit: abs, credit: 0 })
      entries.push({ id: uid('e_'), summary: r.summary, accountCode: opts.bankAccountCode, accountName: opts.bankAccountName, debit: 0, credit: abs })
    }
    return { date: r.date, summary: r.summary, entries }
  })
}
