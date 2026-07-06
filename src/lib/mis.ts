import type { Dataset, MonthAgg } from './types'

export interface MisResult {
  months: MonthAgg[]
  totalIncome: number
  totalExpense: number
  surplus: number
  receivables: number       // net debtor closing
  payables: number          // net creditor closing
  advancesReceived: number  // credit balances in debtors + advance_received ledgers
  advancesPaid: number      // advance_paid ledger balances
  cashBank: number          // bank + cash closing
  statutoryDues: number     // unpaid gst/tds/statutory (credit)
  gstNet: number            // output - input (approx net GST)
  tdsPayable: number
  topExpenseLedgers: { name: string; amount: number }[]
  topIncomeLedgers: { name: string; amount: number }[]
  topParties: { name: string; amount: number; type: string }[]
  voucherTypeCounts: { type: string; count: number }[]
}

// Balances are conventional here: Dr = +, Cr = −.
const sumCat = (ds: Dataset, cat: string, side: 'cr' | 'dr' | 'any' = 'any') =>
  ds.ledgers.filter((l) => l.category === cat).reduce((s, l) => {
    const b = l.closingBalance
    if (side === 'cr') return s + Math.max(0, -b) // credit magnitude
    if (side === 'dr') return s + Math.max(0, b)  // debit magnitude
    return s + b
  }, 0)

export function computeMis(ds: Dataset): MisResult {
  const monthSet = [...new Set(ds.lines.map((l) => l.month).filter(Boolean))].sort()
  const income: Record<string, number> = {}
  const expense: Record<string, number> = {}
  for (const l of ds.lines) {
    if (l.category === 'income') income[l.month] = (income[l.month] ?? 0) + l.natural
    else if (l.category === 'expense') expense[l.month] = (expense[l.month] ?? 0) + l.natural
  }
  const months: MonthAgg[] = monthSet.map((m) => ({
    month: m, income: income[m] ?? 0, expense: expense[m] ?? 0, surplus: (income[m] ?? 0) - (expense[m] ?? 0),
  }))
  const totalIncome = months.reduce((s, m) => s + m.income, 0)
  const totalExpense = months.reduce((s, m) => s + m.expense, 0)

  // receivables: debtor positive closing; advances received: debtor negative closing
  let receivables = 0, advancesReceived = 0, payables = 0
  for (const p of ds.parties) {
    const b = p.closingBalance
    if (p.type === 'debtor') { if (b >= 0) receivables += b; else advancesReceived += -b }
    else if (p.type === 'creditor') { if (b <= 0) payables += -b; else advancesReceived += 0 }
  }
  advancesReceived += sumCat(ds, 'advance_received', 'cr')
  const advancesPaid = Math.abs(sumCat(ds, 'advance_paid'))
  const cashBank = sumCat(ds, 'bank_cash')

  const gstOut = ds.ledgers.filter((l) => l.subtype === 'gst_output' || l.subtype === 'gst_payable').reduce((s, l) => s + Math.abs(l.closingBalance), 0)
  const gstIn = ds.ledgers.filter((l) => l.subtype === 'gst_input').reduce((s, l) => s + Math.abs(l.closingBalance), 0)
  const tdsPayable = ds.ledgers.filter((l) => l.subtype === 'tds_payable').reduce((s, l) => s + Math.abs(l.closingBalance), 0)
  const statutoryDues = sumCat(ds, 'statutory', 'cr') + tdsPayable + sumCat(ds, 'gst', 'cr')

  // top ledgers by movement
  const ledgerMove = new Map<string, { amt: number; cat: string }>()
  for (const l of ds.lines) {
    let a = ledgerMove.get(l.ledgerName); if (!a) { a = { amt: 0, cat: l.category }; ledgerMove.set(l.ledgerName, a) }
    a.amt += l.amount
  }
  const topExpenseLedgers = [...ledgerMove.entries()].filter(([, v]) => v.cat === 'expense')
    .map(([name, v]) => ({ name, amount: v.amt })).sort((a, b) => b.amount - a.amount).slice(0, 10)
  const topIncomeLedgers = [...ledgerMove.entries()].filter(([, v]) => v.cat === 'income')
    .map(([name, v]) => ({ name, amount: v.amt })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 10)
  const topParties = [...ds.parties].map((p) => ({ name: p.name, amount: Math.abs(p.totalDr) + Math.abs(p.totalCr), type: p.type }))
    .sort((a, b) => b.amount - a.amount).slice(0, 10)

  const vtc = new Map<string, number>()
  for (const v of ds.vouchers) vtc.set(v.voucherType, (vtc.get(v.voucherType) ?? 0) + 1)
  const voucherTypeCounts = [...vtc.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)

  return {
    months, totalIncome, totalExpense, surplus: totalIncome - totalExpense,
    receivables, payables, advancesReceived, advancesPaid, cashBank, statutoryDues,
    gstNet: gstOut - gstIn, tdsPayable,
    topExpenseLedgers, topIncomeLedgers, topParties, voucherTypeCounts,
  }
}
