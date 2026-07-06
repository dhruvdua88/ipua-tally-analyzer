import type { Dataset, TdsRule, TdsReviewRow, TdsStatus, DaybookLine } from './types'

// Rules kept only for an optional section hint + backward-compatible imports.
// Detection of TDS is purely ledger-driven (a credit to a TDS payable ledger),
// NOT threshold/keyword based.
export const DEFAULT_TDS_RULES: TdsRule[] = [
  { id: '194C', section: '194C', label: 'Contractor / event / catering', rate: 2, threshold: 0, enabled: true, keywords: ['94c', '194c'] },
  { id: '194J', section: '194J', label: 'Professional / technical', rate: 10, threshold: 0, enabled: true, keywords: ['94j', '194j'] },
  { id: '194I', section: '194I', label: 'Rent', rate: 10, threshold: 0, enabled: true, keywords: ['94i', '194i'] },
  { id: '194H', section: '194H', label: 'Commission', rate: 5, threshold: 0, enabled: true, keywords: ['94h', '194h'] },
]

/** Parse a TDS section hint from narration ("94I", "194C", "u/s 194J"). */
function sectionHint(narration: string, rate: number): string | undefined {
  const m = narration.match(/1?9\s*4\s*([A-Za-z]{1,3})/)
  if (m) return `194${m[1].toUpperCase()}`
  // fall back to effective-rate guess
  if (rate >= 9) return '194J/194I'
  if (rate >= 4 && rate < 6) return '194H'
  if (rate > 0 && rate < 3) return '194C'
  return undefined
}

/**
 * Build the TDS register purely from the TDS ledger movements.
 *
 * A voucher that **credits** a TDS payable ledger = TDS deducted. The base is
 * the expense / vendor-advance being paid in that voucher. A voucher that
 * **debits** TDS payable against bank is a challan remittance, not a deduction,
 * and is excluded. Vendor payments / advances (expense or Loans & Advances)
 * with NO TDS credit are listed as "not deducted" — this is what surfaces the
 * Aldovia venue advance that sits in an asset ledger.
 */
export function computeTdsReview(ds: Dataset, _rules?: TdsRule[]): TdsReviewRow[] {
  const byVoucher = new Map<string, DaybookLine[]>()
  for (const l of ds.lines) {
    let a = byVoucher.get(l.voucherGuid); if (!a) { a = []; byVoucher.set(l.voucherGuid, a) }
    a.push(l)
  }

  const rows: TdsReviewRow[] = []

  for (const [, lines] of byVoucher) {
    const head = lines[0]
    const tdsCredit = lines.filter((l) => l.category === 'tds' && l.subtype === 'tds_payable' && l.drcr === 'Cr')
    const tdsDebitOnly = lines.some((l) => l.category === 'tds' && l.subtype === 'tds_payable' && l.drcr === 'Dr') && !tdsCredit.length

    // base ledgers = what is being paid: expenses, then vendor advances (Loans & Advances)
    const expenseDr = lines.filter((l) => l.category === 'expense' && l.drcr === 'Dr' && l.amount > 0)
    const advanceDr = lines.filter((l) => l.category === 'advance_paid' && l.drcr === 'Dr' && l.amount > 0)
    const baseLines = expenseDr.length ? expenseDr : advanceDr
    const partyName = head.partyName || lines.find((l) => l.category === 'party')?.ledgerName || '—'

    if (tdsCredit.length) {
      // ---- TDS DEDUCTED ----
      const tdsAmount = tdsCredit.reduce((s, l) => s + Math.abs(l.amount), 0)
      const tdsLedger = tdsCredit[0].ledgerName
      const totalBase = baseLines.reduce((s, l) => s + l.amount, 0) || tdsAmount
      const rate = totalBase > 0 ? (tdsAmount / totalBase) * 100 : 0
      const section = sectionHint(head.narration, rate)
      const emitBase = baseLines.length ? baseLines : [{ ...head, ledgerName: partyName, amount: totalBase }]
      for (const b of emitBase) {
        const share = totalBase > 0 ? b.amount / totalBase : 1
        rows.push({
          lineId: b.id ?? `${head.voucherGuid}#tds`,
          date: head.date, voucherType: head.voucherType, voucherNumber: head.voucherNumber,
          party: partyName, ledger: b.ledgerName, amount: b.amount, narration: head.narration,
          tdsLedger, tdsAmount: +(tdsAmount * share).toFixed(2), rate: +rate.toFixed(2), section,
          status: 'deducted', note: `TDS ₹${tdsAmount.toLocaleString('en-IN')} deducted${section ? ' (' + section + ')' : ''}`,
        })
      }
    } else if (!tdsDebitOnly && baseLines.length && /payment|journal|purchase/i.test(head.voucherType)) {
      // ---- VENDOR PAYMENT / ADVANCE WITH NO TDS ----
      for (const b of baseLines) {
        const isAdvance = b.category === 'advance_paid'
        rows.push({
          lineId: b.id,
          date: head.date, voucherType: head.voucherType, voucherNumber: head.voucherNumber,
          party: partyName, ledger: b.ledgerName, amount: b.amount, narration: head.narration,
          tdsLedger: '', tdsAmount: 0, rate: 0, section: sectionHint(head.narration, 0),
          status: 'not_deducted',
          note: isAdvance
            ? 'Vendor advance paid with no TDS deducted — verify 194C/194I applicability'
            : 'Expense/vendor payment with no TDS ledger in voucher',
        })
      }
    }
  }

  rows.sort((a, b) => (a.status === b.status ? (a.date < b.date ? -1 : 1) : a.status === 'not_deducted' ? -1 : 1))
  return rows
}

export const TDS_STATUS_META: Record<TdsStatus, { label: string; color: string }> = {
  deducted: { label: 'Deducted', color: 'ok' },
  not_deducted: { label: 'Not Deducted', color: 'risk' },
}
