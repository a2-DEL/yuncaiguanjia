/**
 * 浏览器端导出工具：CSV（零依赖）与 XLSX（SheetJS）双通道，数据在本地生成，不上传后端。
 */
import * as XLSX from 'xlsx'

export interface ExportSheet {
  name: string
  header: string[]
  rows: Array<Array<string | number>>
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(cell: string | number): string {
  const s = String(cell ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** 导出 CSV（自带 UTF-8 BOM，Excel 中文不乱码） */
export function exportCsv(filename: string, sheet: ExportSheet): void {
  const lines = [
    sheet.header.map(escapeCsv).join(','),
    ...sheet.rows.map((r) => r.map(escapeCsv).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

/** 导出 XLSX（多 Sheet，金额列按数值存储并套用千分位两位小数格式） */
export function exportXlsx(filename: string, sheets: ExportSheet[], amountCols: number[] = []): void {
  const wb = XLSX.utils.book_new()
  for (const sh of sheets) {
    const aoa: Array<Array<string | number>> = [sh.header, ...sh.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // 列宽
    ws['!cols'] = sh.header.map((h, idx) => ({
      wch: Math.max(10, Math.min(40, Math.max(String(h).length * 2, ...sh.rows.map((r) => String(r[idx] ?? '').length * 2)))),
    }))
    // 金额列数值格式
    if (amountCols.length) {
      const range = XLSX.utils.decode_range(ws['!ref'] as string)
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (const c of amountCols) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          if (cell && typeof cell.v === 'number') cell.z = '#,##0.00'
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sh.name)
  }
  XLSX.writeFile(wb, filename)
}

/** 导出 JSON（结构化的全量/单实体数据，便于外部系统 ETL 接入） */
export function exportJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
  triggerDownload(blob, filename)
}
