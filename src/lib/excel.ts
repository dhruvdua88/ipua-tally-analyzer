import * as XLSX from 'xlsx'
import type {
  Dataset, TdsReviewRow, AdvanceRow, GstMonthRow, ExceptionRow,
} from './types'
import type { MisResult } from './mis'
import type { PnlResult, BsResult } from './pnlBs'

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename)
}
function sheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '(no rows)': '' }])
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}

export function exportTds(rows: TdsReviewRow[], company: string) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'TDS Review', rows.map((r) => ({
    Date: r.date, Voucher: `${r.voucherType} ${r.voucherNumber}`, Party: r.party, Ledger: r.ledger,
    Amount: r.amount, Section: r.matchedSection ?? '', 'Rate %': r.expectedRate,
    'Expected TDS': Number(r.expectedTds.toFixed(2)), 'Actual TDS': Number(r.actualTds.toFixed(2)),
    Status: r.status, Note: r.note, Narration: r.narration,
  })))
  download(wb, `TDS_Review_${company}.xlsx`)
}

export function exportGstAdvances(rows: AdvanceRow[], company: string) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'GST on Advances', rows.map((r) => ({
    Date: r.date, Voucher: `${r.voucherType} ${r.voucherNumber}`, Party: r.party,
    'Advance Amt': r.amount, 'GST Booked': Number(r.gstBooked.toFixed(2)), 'GST Expected': Number(r.gstExpected.toFixed(2)),
    'Adjusted Later': r.adjustedLater ? 'Yes' : 'No', Outstanding: r.outstanding ? 'Yes' : 'No',
    'Likely Exempt/Grant': r.likelyExemptOrGrant ? 'Yes' : 'No', Risk: r.risk, Note: r.note,
  })))
  download(wb, `GST_Advances_${company}.xlsx`)
}

export function exportGstRecon(rows: GstMonthRow[], company: string) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'GST Reconciliation', rows.map((r) => ({
    Month: r.month, 'Output GST': r.outputGst, 'Input GST': r.inputGst, RCM: r.rcm,
    'Net Liability': Number(r.netLiability.toFixed(2)), 'GST Payable Ledger': r.gstPayableLedger, 'GST Paid': r.gstPaid,
    'Sales Taxable': r.salesTaxable, 'Sales w/o GST': r.salesWithoutGst, 'GST w/o Sales': r.gstWithoutSales,
    Flags: r.flags.join('; '),
  })))
  download(wb, `GST_Reconciliation_${company}.xlsx`)
}

export function exportExceptions(rows: ExceptionRow[], company: string) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Exceptions', rows.map((r) => ({
    Severity: r.severity, Type: r.type, Title: r.title, Detail: r.detail,
    Amount: r.amount ?? '', Reference: r.ref ?? '', Ledger: r.ledgerName ?? '',
  })))
  download(wb, `Exceptions_${company}.xlsx`)
}

export function exportLedgerMapping(ds: Dataset) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Ledger Mapping', ds.ledgers.map((l) => ({
    Ledger: l.name, Group: l.parent, 'Primary Group': l.primaryGroup,
    Category: l.category, Subtype: l.subtype, Source: l.source, Reason: l.reason,
    'Opening Bal': l.openingBalance, 'Closing Bal': l.closingBalance,
    GSTIN: l.gstn ?? '', PAN: l.itPan ?? '',
  })))
  download(wb, `Ledger_Mapping_${ds.company}.xlsx`)
}

export function exportMis(mis: MisResult, pnl: PnlResult, bs: BsResult, company: string) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Monthly', mis.months.map((m) => ({ Month: m.month, Income: m.income, Expense: m.expense, Surplus: m.surplus })))
  sheet(wb, 'Summary', [
    { Metric: 'Total Income', Value: mis.totalIncome }, { Metric: 'Total Expense', Value: mis.totalExpense },
    { Metric: 'Surplus/Deficit', Value: mis.surplus }, { Metric: 'Receivables', Value: mis.receivables },
    { Metric: 'Payables', Value: mis.payables }, { Metric: 'Advances Received', Value: mis.advancesReceived },
    { Metric: 'Advances Paid', Value: mis.advancesPaid }, { Metric: 'Cash & Bank', Value: mis.cashBank },
    { Metric: 'Statutory Dues', Value: mis.statutoryDues }, { Metric: 'GST Net', Value: mis.gstNet },
    { Metric: 'TDS Payable', Value: mis.tdsPayable },
  ])
  sheet(wb, 'Top Expenses', mis.topExpenseLedgers.map((l) => ({ Ledger: l.name, Amount: l.amount })))
  sheet(wb, 'Top Parties', mis.topParties.map((p) => ({ Party: p.name, Type: p.type, Turnover: p.amount })))
  sheet(wb, 'P&L', [
    ...pnl.income.map((n) => ({ Section: 'Income', Group: n.label, Amount: n.amount })),
    ...pnl.expense.map((n) => ({ Section: 'Expense', Group: n.label, Amount: n.amount })),
    { Section: 'Result', Group: 'Surplus/Deficit', Amount: pnl.surplus },
  ])
  sheet(wb, 'Balance Sheet', [
    ...bs.assets.map((n) => ({ Side: 'Asset', Group: n.label, Amount: n.amount })),
    ...bs.liabilities.map((n) => ({ Side: 'Liability', Group: n.label, Amount: n.amount })),
  ])
  download(wb, `MIS_${company}.xlsx`)
}

/** Normalized database: every entity table. */
export function exportDatabase(ds: Dataset) {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Groups', ds.groups as unknown as Record<string, unknown>[])
  sheet(wb, 'Ledgers', ds.ledgers.map((l) => ({
    name: l.name, group: l.parent, primaryGroup: l.primaryGroup, category: l.category, subtype: l.subtype,
    opening: l.openingBalance, closing: l.closingBalance, gstn: l.gstn ?? '', pan: l.itPan ?? '',
  })))
  sheet(wb, 'Vouchers', ds.vouchers.map((v) => ({
    guid: v.guid, date: v.date, type: v.voucherType, number: v.voucherNumber, party: v.partyName, narration: v.narration,
  })))
  sheet(wb, 'DaybookLines', ds.lines.map((l) => ({
    date: l.date, type: l.voucherType, number: l.voucherNumber, party: l.partyName, ledger: l.ledgerName,
    group: l.primaryGroup, category: l.category, amount: l.amount, drcr: l.drcr, narration: l.narration,
  })))
  sheet(wb, 'Parties', ds.parties as unknown as Record<string, unknown>[])
  sheet(wb, 'Bills', ds.bills as unknown as Record<string, unknown>[])
  sheet(wb, 'BankLines', ds.bankLines as unknown as Record<string, unknown>[])
  download(wb, `Normalized_DB_${ds.company}.xlsx`)
}
