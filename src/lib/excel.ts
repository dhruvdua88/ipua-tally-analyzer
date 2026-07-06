import ExcelJS from 'exceljs'
import type {
  Dataset, TdsReviewRow, AdvanceRow, GstMonthRow, ExceptionRow,
} from './types'
import type { MisResult } from './mis'
import type { PnlResult, BsResult } from './pnlBs'

// ============================================================================
// God-tier styled Excel exports (ExcelJS). Every workbook shares one visual
// system: gold title band, dark branded header, zebra rows, Indian-format ₹
// number formats, colored risk/status cells, totals, freeze panes, autofilter.
// ============================================================================

const BRAND = 'IPUA TALLY ANALYZER'

// ARGB palette
const C = {
  ink: 'FF11161C',
  inkHeader: 'FF1B2430',
  gold: 'FFC7922E',
  goldDeep: 'FFA9791F',
  white: 'FFFFFFFF',
  cream: 'FFF8F5EE',
  creamAlt: 'FFFFFFFF',
  border: 'FFDDD6C7',
  borderSoft: 'FFECE7DA',
  muted: 'FF6B7280',
  okFill: 'FFE6F4EC', okText: 'FF1E7F4E',
  warnFill: 'FFFDF2DC', warnText: 'FF97600A',
  riskFill: 'FFFBE7E7', riskText: 'FFB42318',
  infoFill: 'FFE8F1FB', infoText: 'FF1D5FA8',
  muteFill: 'FFF0F0F0', muteText: 'FF52606D',
}

const MONEY_FMT = '₹\\ #,##,##0.00;[Red]-₹\\ #,##,##0.00'
const MONEY0_FMT = '₹\\ #,##,##0;[Red]-₹\\ #,##,##0'
const INT_FMT = '#,##,##0'
const PCT_FMT = '0.0"%"'

type ColType = 'text' | 'money' | 'money0' | 'int' | 'pct' | 'status' | 'center' | 'date'
interface ColDef {
  header: string
  key: string
  width?: number
  type?: ColType
  total?: boolean
}
type ColorTag = keyof typeof TAG
const TAG = {
  ok: { fill: C.okFill, text: C.okText },
  warn: { fill: C.warnFill, text: C.warnText },
  risk: { fill: C.riskFill, text: C.riskText },
  info: { fill: C.infoFill, text: C.infoText },
  muted: { fill: C.muteFill, text: C.muteText },
} as const

interface SheetOpts {
  title: string
  subtitle: string
  columns: ColDef[]
  rows: Record<string, unknown>[]
  tagFor?: (row: Record<string, unknown>, colKey: string) => ColorTag | undefined
  note?: string
  freeze?: boolean
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}
const thin = { style: 'thin' as const, color: { argb: C.borderSoft } }

function addStyledSheet(wb: ExcelJS.Workbook, name: string, o: SheetOpts) {
  const ws = wb.addWorksheet(name.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 0 }],
    properties: { defaultRowHeight: 18 },
  })
  ws.properties.tabColor = { argb: C.gold }
  const n = o.columns.length

  // Row 1 — brand + title band
  ws.mergeCells(1, 1, 1, n)
  const t = ws.getCell(1, 1)
  t.value = { richText: [
    { text: `${BRAND}   `, font: { bold: true, size: 9, color: { argb: 'FF3A2E12' } } },
    { text: o.title, font: { bold: true, size: 14, color: { argb: C.ink } } },
  ] }
  t.fill = fill(C.gold)
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30

  // Row 2 — subtitle
  ws.mergeCells(2, 1, 2, n)
  const s = ws.getCell(2, 1)
  s.value = o.subtitle
  s.fill = fill(C.goldDeep)
  s.font = { italic: true, size: 9.5, color: { argb: C.white } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 17

  // Row 3 — spacer
  ws.getRow(3).height = 5

  // Row 4 — header
  const header = ws.getRow(4)
  o.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.fill = fill(C.inkHeader)
    cell.font = { bold: true, size: 10, color: { argb: C.white } }
    cell.alignment = { vertical: 'middle', horizontal: numeric(c.type) ? 'right' : c.type === 'center' ? 'center' : 'left', wrapText: true }
    cell.border = { top: thin, bottom: { style: 'medium', color: { argb: C.gold } }, left: thin, right: thin }
  })
  header.height = 24

  // Data rows
  o.rows.forEach((row, ri) => {
    const r = ws.getRow(5 + ri)
    const zebra = ri % 2 === 1
    o.columns.forEach((c, ci) => {
      const cell = r.getCell(ci + 1)
      const v = row[c.key]
      cell.value = (v === undefined || v === null || v === '') ? (numeric(c.type) ? 0 : '') : (v as ExcelJS.CellValue)
      applyType(cell, c.type)
      cell.border = { top: thin, bottom: thin, left: thin, right: thin }
      if (zebra) cell.fill = fill(C.cream)
      // status/risk coloring
      const tag = o.tagFor?.(row, c.key)
      if (tag) {
        cell.fill = fill(TAG[tag].fill)
        cell.font = { ...(cell.font || {}), color: { argb: TAG[tag].text }, bold: c.type === 'status' }
      }
    })
  })

  // Totals row
  const hasTotal = o.columns.some((c) => c.total)
  if (hasTotal && o.rows.length) {
    const tr = ws.getRow(5 + o.rows.length)
    o.columns.forEach((c, ci) => {
      const cell = tr.getCell(ci + 1)
      if (ci === 0) cell.value = 'TOTAL'
      else if (c.total) {
        cell.value = o.rows.reduce((sum, row) => sum + (Number(row[c.key]) || 0), 0)
        applyType(cell, c.type)
      }
      cell.font = { bold: true, size: 10, color: { argb: C.ink } }
      cell.fill = fill(C.borderSoft)
      cell.border = { top: { style: 'double', color: { argb: C.goldDeep } }, bottom: thin, left: thin, right: thin }
    })
    tr.height = 20
  }

  // Note row
  if (o.note) {
    const noteRow = 5 + o.rows.length + (hasTotal ? 1 : 0) + 1
    ws.mergeCells(noteRow, 1, noteRow, n)
    const nc = ws.getCell(noteRow, 1)
    nc.value = o.note
    nc.font = { italic: true, size: 9, color: { argb: C.muted } }
    nc.alignment = { wrapText: true, vertical: 'top' }
  }

  // Column widths + autofilter
  o.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? Math.max(10, Math.min(48, c.header.length + 4)) })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } }
  return ws
}

function numeric(t?: ColType) { return t === 'money' || t === 'money0' || t === 'int' || t === 'pct' }
function applyType(cell: ExcelJS.Cell, t?: ColType) {
  switch (t) {
    case 'money': cell.numFmt = MONEY_FMT; cell.alignment = { horizontal: 'right' }; break
    case 'money0': cell.numFmt = MONEY0_FMT; cell.alignment = { horizontal: 'right' }; break
    case 'int': cell.numFmt = INT_FMT; cell.alignment = { horizontal: 'right' }; break
    case 'pct': cell.numFmt = PCT_FMT; cell.alignment = { horizontal: 'right' }; break
    case 'center': cell.alignment = { horizontal: 'center' }; break
    case 'date': cell.alignment = { horizontal: 'left' }; break
    default: cell.alignment = { horizontal: 'left', wrapText: false }
  }
  if (!cell.font) cell.font = { size: 10, color: { argb: C.ink } }
}

function stamp(company: string, extra?: string) {
  const now = new Date()
  const d = `${String(now.getDate()).padStart(2, '0')}-${now.toLocaleString('en-GB', { month: 'short' })}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return `${company}${extra ? '  ·  ' + extra : ''}  ·  Generated ${d}`
}

async function save(wb: ExcelJS.Workbook, filename: string) {
  wb.creator = BRAND
  wb.created = new Date()
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const clean = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
const fname = (report: string, company: string) => `IPUA_${report}_${clean(company)}.xlsx`

// ---- Exports -----------------------------------------------------------

export async function exportTds(rows: TdsReviewRow[], company: string) {
  const wb = new ExcelJS.Workbook()
  const deducted = rows.filter((r) => r.status === 'deducted')
  const notDeducted = rows.filter((r) => r.status === 'not_deducted')
  const totalTds = deducted.reduce((s, r) => s + r.tdsAmount, 0)

  // Sheet 1 — TDS deducted per transaction
  addStyledSheet(wb, 'TDS Deducted', {
    title: 'TDS Deducted — per transaction',
    subtitle: stamp(company, `${deducted.length} deductions · ₹${Math.round(totalTds).toLocaleString('en-IN')} TDS`),
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Voucher', key: 'voucher', width: 16 },
      { header: 'Party', key: 'party', width: 30 },
      { header: 'Base Ledger', key: 'ledger', width: 28 },
      { header: 'Base Amount', key: 'amount', type: 'money', width: 16, total: true },
      { header: 'TDS Ledger', key: 'tdsLedger', width: 18 },
      { header: 'TDS Deducted', key: 'tds', type: 'money', width: 16, total: true },
      { header: 'Rate %', key: 'rate', type: 'pct', width: 9 },
      { header: 'Section', key: 'section', type: 'center', width: 12 },
      { header: 'Narration', key: 'narration', width: 40 },
    ],
    rows: deducted.map((r) => ({
      date: r.date, voucher: `${r.voucherType} #${r.voucherNumber}`, party: r.party, ledger: r.ledger,
      amount: r.amount, tdsLedger: r.tdsLedger, tds: r.tdsAmount, rate: r.rate, section: r.section ?? '—', narration: r.narration,
    })),
    note: 'TDS identified directly from credits to the TDS payable ledger. Rate = TDS ÷ base amount. TDS challan payments (debits to the TDS ledger vs bank) are excluded.',
  })

  // Sheet 2 — vendor payments / advances with no TDS
  addStyledSheet(wb, 'TDS Not Deducted', {
    title: 'Vendor Payments / Advances — No TDS Deducted',
    subtitle: stamp(company, `${notDeducted.length} items · ₹${Math.round(notDeducted.reduce((s, r) => s + r.amount, 0)).toLocaleString('en-IN')} paid`),
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Voucher', key: 'voucher', width: 16 },
      { header: 'Party', key: 'party', width: 30 },
      { header: 'Ledger', key: 'ledger', width: 28 },
      { header: 'Amount Paid', key: 'amount', type: 'money', width: 16, total: true },
      { header: 'Section?', key: 'section', type: 'center', width: 12 },
      { header: 'Why flagged', key: 'note', width: 52 },
    ],
    rows: notDeducted.map((r) => ({
      date: r.date, voucher: `${r.voucherType} #${r.voucherNumber}`, party: r.party, ledger: r.ledger,
      amount: r.amount, section: r.section ?? '—', note: r.note,
    })),
    tagFor: (row, key) => key === 'note' ? 'risk' : undefined,
    note: 'Vendor payments and advances (incl. Loans & Advances such as venue advances) with no TDS credit in the voucher — e.g. the Aldovia venue advance. Verify 194C/194I/194J applicability.',
  })

  await save(wb, fname('TDS_Register', company))
}

export async function exportGstAdvances(rows: AdvanceRow[], company: string) {
  const wb = new ExcelJS.Workbook()
  const riskTag: Record<string, ColorTag> = { ok: 'ok', low: 'muted', medium: 'warn', high: 'risk' }
  addStyledSheet(wb, 'GST on Advances', {
    title: 'GST on Advances',
    subtitle: stamp(company, `${rows.length} receipts · ₹${rows.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')} received`),
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Voucher', key: 'voucher', width: 14 },
      { header: 'Party', key: 'party', width: 32 },
      { header: 'Advance Amt', key: 'amount', type: 'money', width: 17, total: true },
      { header: 'GST Booked', key: 'gstBooked', type: 'money', width: 15, total: true },
      { header: 'GST Expected', key: 'gstExpected', type: 'money', width: 15, total: true },
      { header: 'Adjusted', key: 'adjusted', type: 'center', width: 10 },
      { header: 'Outstanding', key: 'outstanding', type: 'center', width: 12 },
      { header: 'Exempt/Grant', key: 'exempt', type: 'center', width: 13 },
      { header: 'Risk', key: 'riskLabel', type: 'status', width: 10 },
      { header: 'Note', key: 'note', width: 46 },
    ],
    rows: rows.map((r) => ({
      date: r.date, voucher: `${r.voucherType} #${r.voucherNumber}`, party: r.party, amount: r.amount,
      gstBooked: +r.gstBooked.toFixed(2), gstExpected: +r.gstExpected.toFixed(2),
      adjusted: r.adjustedLater ? 'Yes' : 'No', outstanding: r.outstanding ? 'Yes' : 'No',
      exempt: r.likelyExemptOrGrant ? 'Yes' : 'No',
      riskLabel: r.risk.toUpperCase(), risk: r.risk, note: r.note,
    })),
    tagFor: (row, key) => key === 'riskLabel' ? riskTag[String(row.risk)] : undefined,
    note: 'GST on advances for services is a live liability (goods advances exempt post-Nov-2017). High risk = taxable service advance outstanding with no GST booked.',
  })
  await save(wb, fname('GST_Advances', company))
}

export async function exportGstRecon(rows: GstMonthRow[], company: string) {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, 'GST Reconciliation', {
    title: 'GST Reconciliation — Month-wise',
    subtitle: stamp(company, `${rows.length} months`),
    columns: [
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Output GST', key: 'outputGst', type: 'money', width: 16, total: true },
      { header: 'Input GST (ITC)', key: 'inputGst', type: 'money', width: 16, total: true },
      { header: 'RCM', key: 'rcm', type: 'money', width: 14, total: true },
      { header: 'Net Liability', key: 'netLiability', type: 'money', width: 16, total: true },
      { header: 'GST Paid', key: 'gstPaid', type: 'money', width: 15, total: true },
      { header: 'Sales Taxable', key: 'salesTaxable', type: 'money', width: 16, total: true },
      { header: 'Sales w/o GST', key: 'salesWithoutGst', type: 'money', width: 15, total: true },
      { header: 'GST w/o Sales', key: 'gstWithoutSales', type: 'money', width: 15, total: true },
      { header: 'Flags', key: 'flags', width: 40 },
    ],
    rows: rows.map((r) => ({
      month: r.month, outputGst: r.outputGst, inputGst: r.inputGst, rcm: r.rcm,
      netLiability: +r.netLiability.toFixed(2), gstPaid: r.gstPaid, salesTaxable: r.salesTaxable,
      salesWithoutGst: r.salesWithoutGst, gstWithoutSales: r.gstWithoutSales, flags: r.flags.join('; ') || '—',
    })),
    tagFor: (row, key) => key === 'flags' && String(row.flags) !== '—' ? 'warn' : undefined,
  })
  await save(wb, fname('GST_Reconciliation', company))
}

export async function exportExceptions(rows: ExceptionRow[], company: string) {
  const wb = new ExcelJS.Workbook()
  const sevTag: Record<string, ColorTag> = { high: 'risk', medium: 'warn', low: 'muted' }
  const typeLabel: Record<string, string> = {
    missing_tds: 'Missing/Short TDS', gst_advance: 'GST on Advance', statutory_unpaid: 'Unpaid Statutory',
    old_advance: 'Old Advance', negative_party: 'Reverse Party Bal', manual_journal: 'Manual Journal',
    unclassified_ledger: 'Unclassified', duplicate_voucher: 'Duplicate Voucher', missing_narration: 'Missing Narration',
  }
  addStyledSheet(wb, 'Exceptions', {
    title: 'Exceptions Register',
    subtitle: stamp(company, `${rows.filter((r) => r.severity === 'high').length} high · ${rows.filter((r) => r.severity === 'medium').length} medium · ${rows.filter((r) => r.severity === 'low').length} low`),
    columns: [
      { header: 'Severity', key: 'sev', type: 'status', width: 11 },
      { header: 'Type', key: 'typeLabel', width: 18 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Detail', key: 'detail', width: 60 },
      { header: 'Amount', key: 'amount', type: 'money', width: 16 },
      { header: 'Reference', key: 'ref', width: 18 },
    ],
    rows: rows.map((r) => ({
      sev: r.severity.toUpperCase(), severity: r.severity, typeLabel: typeLabel[r.type] ?? r.type,
      title: r.title, detail: r.detail, amount: r.amount ?? '', ref: r.ref ?? r.ledgerName ?? '',
    })),
    tagFor: (row, key) => key === 'sev' ? sevTag[String(row.severity)] : undefined,
  })
  await save(wb, fname('Exceptions', company))
}

export async function exportLedgerMapping(ds: Dataset) {
  const wb = new ExcelJS.Workbook()
  const catTag: Record<string, ColorTag> = {
    income: 'ok', expense: 'info', gst: 'warn', tds: 'warn', statutory: 'warn',
    advance_received: 'warn', advance_paid: 'warn', unclassified: 'risk',
  }
  addStyledSheet(wb, 'Ledger Mapping', {
    title: 'Ledger Mapping & Classification',
    subtitle: stamp(ds.company, `${ds.ledgers.length} ledgers`),
    columns: [
      { header: 'Ledger', key: 'name', width: 34 },
      { header: 'Group', key: 'group', width: 22 },
      { header: 'Primary Group', key: 'pg', width: 20 },
      { header: 'Category', key: 'category', type: 'status', width: 18 },
      { header: 'Subtype', key: 'subtype', width: 18 },
      { header: 'Source', key: 'source', type: 'center', width: 9 },
      { header: 'Opening', key: 'opening', type: 'money', width: 16 },
      { header: 'Closing', key: 'closing', type: 'money', width: 16 },
      { header: 'GSTIN', key: 'gstn', width: 18 },
      { header: 'PAN', key: 'pan', width: 14 },
      { header: 'Reason', key: 'reason', width: 40 },
    ],
    rows: ds.ledgers.map((l) => ({
      name: l.name, group: l.parent, pg: l.primaryGroup, category: l.category, subtype: l.subtype,
      source: l.source, opening: l.openingBalance, closing: l.closingBalance,
      gstn: l.gstn ?? '', pan: l.itPan ?? '', reason: l.reason,
    })),
    tagFor: (row, key) => key === 'category' ? catTag[String(row.category)] : undefined,
  })
  await save(wb, fname('Ledger_Mapping', ds.company))
}

export async function exportMis(mis: MisResult, pnl: PnlResult, bs: BsResult, company: string) {
  const wb = new ExcelJS.Workbook()
  const period = stamp(company)

  // Monthly
  addStyledSheet(wb, 'Monthly', {
    title: 'MIS — Monthly Income & Expense', subtitle: period,
    columns: [
      { header: 'Month', key: 'month', width: 14 },
      { header: 'Income', key: 'income', type: 'money', width: 18, total: true },
      { header: 'Expense', key: 'expense', type: 'money', width: 18, total: true },
      { header: 'Surplus / Deficit', key: 'surplus', type: 'money', width: 18, total: true },
    ],
    rows: mis.months.map((m) => ({ month: m.month, income: m.income, expense: m.expense, surplus: m.surplus })),
    tagFor: (row) => (Number(row.surplus) < 0 ? 'risk' : undefined),
  })

  // Summary / KPIs
  addStyledSheet(wb, 'Summary', {
    title: 'MIS — Position Summary', subtitle: period,
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Amount', key: 'value', type: 'money', width: 22 },
    ],
    rows: [
      { metric: 'Total Income', value: mis.totalIncome },
      { metric: 'Total Expense', value: mis.totalExpense },
      { metric: 'Surplus / Deficit', value: mis.surplus },
      { metric: 'Receivables', value: mis.receivables },
      { metric: 'Payables', value: mis.payables },
      { metric: 'Advances Received', value: mis.advancesReceived },
      { metric: 'Advances Paid', value: mis.advancesPaid },
      { metric: 'Cash & Bank', value: mis.cashBank },
      { metric: 'Statutory Dues', value: mis.statutoryDues },
      { metric: 'GST Net (Output − Input)', value: mis.gstNet },
      { metric: 'TDS Payable', value: mis.tdsPayable },
    ],
  })

  // Top expenses & parties
  addStyledSheet(wb, 'Top Expenses', {
    title: 'MIS — Top Expense Ledgers', subtitle: period,
    columns: [{ header: 'Ledger', key: 'name', width: 40 }, { header: 'Amount', key: 'amount', type: 'money', width: 20, total: true }],
    rows: mis.topExpenseLedgers.map((l) => ({ name: l.name, amount: Math.abs(l.amount) })),
  })
  addStyledSheet(wb, 'Top Parties', {
    title: 'MIS — Top Parties by Turnover', subtitle: period,
    columns: [
      { header: 'Party', key: 'name', width: 40 }, { header: 'Type', key: 'type', type: 'center', width: 12 },
      { header: 'Turnover', key: 'amount', type: 'money', width: 20, total: true },
    ],
    rows: mis.topParties.map((p) => ({ name: p.name, type: p.type, amount: p.amount })),
  })

  // P&L
  addStyledSheet(wb, 'P&L', {
    title: 'Profit & Loss / Income & Expenditure', subtitle: period,
    columns: [
      { header: 'Section', key: 'section', width: 14 }, { header: 'Group', key: 'group', width: 28 },
      { header: 'Amount', key: 'amount', type: 'money', width: 20 },
    ],
    rows: [
      ...pnl.income.map((nn) => ({ section: 'Income', group: nn.label, amount: nn.amount })),
      ...pnl.expense.map((nn) => ({ section: 'Expense', group: nn.label, amount: nn.amount })),
      { section: 'Result', group: 'Surplus / Deficit', amount: pnl.surplus },
    ],
    tagFor: (row) => row.section === 'Result' ? (Number(row.amount) < 0 ? 'risk' : 'ok') : undefined,
  })

  // Balance Sheet
  addStyledSheet(wb, 'Balance Sheet', {
    title: 'Balance Sheet', subtitle: period,
    columns: [
      { header: 'Side', key: 'side', type: 'center', width: 12 }, { header: 'Group', key: 'group', width: 30 },
      { header: 'Amount', key: 'amount', type: 'money', width: 20, total: true },
    ],
    rows: [
      ...bs.assets.map((nn) => ({ side: 'Asset', group: nn.label, amount: nn.amount })),
      ...bs.liabilities.map((nn) => ({ side: 'Liability', group: nn.label, amount: nn.amount })),
    ],
    note: `Assets ₹${bs.totalAssets.toLocaleString('en-IN')} · Liabilities+Equity ₹${bs.totalLiabilities.toLocaleString('en-IN')} · Period surplus ₹${bs.surplus.toLocaleString('en-IN')} carried to reserves · Difference ₹${bs.difference.toLocaleString('en-IN')}.`,
  })

  await save(wb, fname('MIS', company))
}

export async function exportDatabase(ds: Dataset) {
  const wb = new ExcelJS.Workbook()
  const period = stamp(ds.company, 'Normalized database')

  addStyledSheet(wb, 'Ledgers', {
    title: 'Normalized DB — Ledgers', subtitle: period,
    columns: [
      { header: 'Name', key: 'name', width: 34 }, { header: 'Group', key: 'group', width: 22 },
      { header: 'Primary Group', key: 'pg', width: 20 }, { header: 'Category', key: 'category', width: 16 },
      { header: 'Subtype', key: 'subtype', width: 16 }, { header: 'Opening', key: 'opening', type: 'money', width: 16 },
      { header: 'Closing', key: 'closing', type: 'money', width: 16 }, { header: 'GSTIN', key: 'gstn', width: 18 }, { header: 'PAN', key: 'pan', width: 14 },
    ],
    rows: ds.ledgers.map((l) => ({ name: l.name, group: l.parent, pg: l.primaryGroup, category: l.category, subtype: l.subtype, opening: l.openingBalance, closing: l.closingBalance, gstn: l.gstn ?? '', pan: l.itPan ?? '' })),
  })
  addStyledSheet(wb, 'Vouchers', {
    title: 'Normalized DB — Vouchers', subtitle: period,
    columns: [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'type', width: 16 }, { header: 'Number', key: 'number', type: 'center', width: 10 },
      { header: 'Party', key: 'party', width: 30 }, { header: 'Place of Supply', key: 'pos', width: 16 }, { header: 'Narration', key: 'narration', width: 50 },
    ],
    rows: ds.vouchers.map((v) => ({ date: v.date, type: v.voucherType, number: v.voucherNumber, party: v.partyName, pos: v.placeOfSupply, narration: v.narration })),
  })
  addStyledSheet(wb, 'Daybook Lines', {
    title: 'Normalized DB — Daybook (accounting lines)', subtitle: period,
    columns: [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Voucher', key: 'voucher', width: 16 }, { header: 'Party', key: 'party', width: 28 },
      { header: 'Ledger', key: 'ledger', width: 28 }, { header: 'Primary Group', key: 'pg', width: 20 }, { header: 'Category', key: 'category', width: 15 },
      { header: 'Dr/Cr', key: 'drcr', type: 'center', width: 8 }, { header: 'Amount', key: 'amount', type: 'money', width: 17, total: true }, { header: 'Narration', key: 'narration', width: 44 },
    ],
    rows: ds.lines.map((l) => ({ date: l.date, voucher: `${l.voucherType} #${l.voucherNumber}`, party: l.partyName, ledger: l.ledgerName, pg: l.primaryGroup, category: l.category, drcr: l.drcr, amount: l.amount, narration: l.narration })),
  })
  addStyledSheet(wb, 'Parties', {
    title: 'Normalized DB — Parties', subtitle: period,
    columns: [
      { header: 'Name', key: 'name', width: 34 }, { header: 'Type', key: 'type', type: 'center', width: 12 }, { header: 'Closing Bal', key: 'closing', type: 'money', width: 18, total: true },
      { header: 'Total Dr', key: 'dr', type: 'money', width: 16, total: true }, { header: 'Total Cr', key: 'cr', type: 'money', width: 16, total: true },
      { header: 'Vouchers', key: 'vc', type: 'int', width: 10 }, { header: 'GSTIN', key: 'gstn', width: 18 },
    ],
    rows: ds.parties.map((p) => ({ name: p.name, type: p.type, closing: p.closingBalance, dr: p.totalDr, cr: p.totalCr, vc: p.voucherCount, gstn: p.gstn ?? '' })),
  })

  await save(wb, fname('Normalized_DB', ds.company))
}
