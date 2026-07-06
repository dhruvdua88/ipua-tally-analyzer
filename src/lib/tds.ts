import type { Dataset, TdsRule, TdsReviewRow, TdsStatus } from './types'

/** Editable default TDS rule set (India, common sections). Thresholds are
 *  single-transaction / annual limits used as a heuristic trigger. */
export const DEFAULT_TDS_RULES: TdsRule[] = [
  { id: '194C', section: '194C', label: 'Contractors / Event / Catering / Decor', rate: 2, threshold: 30000, enabled: true,
    keywords: ['contractor', 'event', 'decor', 'catering', 'stall', 'fabricat', 'labour', 'housekeep', 'security', 'transport', 'printing', 'production', 'setup', 'stage', 'sound', 'light', 'venue', 'management fee'] },
  { id: '194J', section: '194J', label: 'Professional / Technical / Consultancy', rate: 10, threshold: 30000, enabled: true,
    keywords: ['professional', 'legal', 'consult', 'audit', 'technical', 'design', 'creative', 'photograph', 'video', 'artist', 'anchor', 'speaker', 'social media', 'digital', 'software', 'fees'] },
  { id: '194I', section: '194I', label: 'Rent (land/building/plant)', rate: 10, threshold: 240000, enabled: true,
    keywords: ['rent', 'hire', 'lease', 'hall', 'hotel', 'room', 'equipment hire'] },
  { id: '194H', section: '194H', label: 'Commission / Brokerage', rate: 2, threshold: 20000, enabled: true,
    keywords: ['commission', 'brokerage'] },
  { id: '194A', section: '194A', label: 'Interest (other than securities)', rate: 10, threshold: 5000, enabled: true,
    keywords: ['interest'] },
  { id: '194Q', section: '194Q', label: 'Purchase of goods', rate: 0.1, threshold: 5000000, enabled: false,
    keywords: ['purchase of goods', 'material purchase'] },
]

function matchSection(ledger: string, narration: string, rules: TdsRule[]): TdsRule | undefined {
  const hay = `${ledger} ${narration}`.toLowerCase()
  let best: TdsRule | undefined
  let bestLen = 0
  for (const r of rules) {
    if (!r.enabled) continue
    for (const k of r.keywords) {
      if (hay.includes(k.toLowerCase()) && k.length > bestLen) { best = r; bestLen = k.length }
    }
  }
  return best
}

/**
 * Build the per-expense-line TDS review. Groups by voucher so the TDS actually
 * booked in a voucher is compared against expected TDS on that voucher's
 * expense lines.
 */
export function computeTdsReview(ds: Dataset, rules: TdsRule[]): TdsReviewRow[] {
  const byVoucher = new Map<string, typeof ds.lines>()
  for (const l of ds.lines) {
    let a = byVoucher.get(l.voucherGuid)
    if (!a) { a = []; byVoucher.set(l.voucherGuid, a) }
    a.push(l)
  }

  const rows: TdsReviewRow[] = []
  for (const [, lines] of byVoucher) {
    // TDS booked in this voucher (credit to TDS payable = negative-ish; use abs)
    const tdsBooked = lines
      .filter((l) => l.category === 'tds' && l.subtype === 'tds_payable')
      .reduce((s, l) => s + Math.abs(l.amount), 0)

    const expenseLines = lines.filter((l) => l.category === 'expense' && l.amount > 0)
    if (!expenseLines.length) continue

    // expected TDS per expense line
    const per = expenseLines.map((l) => {
      const rule = matchSection(l.ledgerName, l.narration, rules)
      const rate = rule?.rate ?? 0
      const expected = rule ? (l.amount * rate) / 100 : 0
      return { l, rule, rate, expected }
    })
    const totalExpected = per.reduce((s, p) => s + p.expected, 0)

    for (const p of per) {
      const { l, rule, rate, expected } = p
      // allocate booked TDS proportionally to expected
      const alloc = totalExpected > 0 ? (tdsBooked * expected) / totalExpected : (per.length ? tdsBooked / per.length : 0)
      let status: TdsStatus
      let note = ''
      if (!rule) {
        status = 'manual_review'
        note = 'No TDS section matched — verify nature of payment'
      } else if (l.amount < rule.threshold) {
        status = 'below_threshold'
        note = `Below ₹${rule.threshold.toLocaleString('en-IN')} ${rule.section} threshold`
      } else if (alloc <= 1) {
        status = 'not_deducted'
        note = `Expected ${rate}% ${rule.section}, none deducted`
      } else if (alloc >= expected * 0.95) {
        status = 'deducted'
        note = `TDS deducted (${rule.section})`
      } else {
        status = 'short_deducted'
        note = `Short: booked ≈ ₹${alloc.toFixed(0)} vs expected ₹${expected.toFixed(0)}`
      }
      rows.push({
        lineId: l.id,
        date: l.date,
        voucherType: l.voucherType,
        voucherNumber: l.voucherNumber,
        party: l.partyName || '—',
        ledger: l.ledgerName,
        amount: l.amount,
        narration: l.narration,
        matchedSection: rule?.section,
        expectedRate: rate,
        expectedTds: expected,
        actualTds: alloc,
        status,
        note,
      })
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}

export const TDS_STATUS_META: Record<TdsStatus, { label: string; color: string; severity: 'high' | 'medium' | 'low' | 'ok' }> = {
  deducted: { label: 'Deducted', color: 'ok', severity: 'ok' },
  not_deducted: { label: 'Not Deducted', color: 'risk', severity: 'high' },
  short_deducted: { label: 'Short Deducted', color: 'warn', severity: 'medium' },
  below_threshold: { label: 'Below Threshold', color: 'muted', severity: 'low' },
  manual_review: { label: 'Manual Review', color: 'info', severity: 'medium' },
}
