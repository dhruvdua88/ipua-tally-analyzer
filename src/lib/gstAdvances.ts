import type { Dataset, AdvanceRow, AdvanceRisk, DaybookLine } from './types'

const EXEMPT_RE = /grant|donat|csr|corpus|contribut|subsid|reimburse|refund|exempt|membership|govt|government/i
const GST_ON_ADVANCE_RATE = 18 // service default; GST on advance applies to services

/** Sum GST lines inside a voucher. */
function gstInVoucher(lines: DaybookLine[]): number {
  return lines.filter((l) => l.category === 'gst').reduce((s, l) => s + Math.abs(l.amount), 0)
}

/**
 * Identify advances received and assess GST-on-advance exposure.
 * Approach: Receipt vouchers where a debtor/party is credited (money received)
 * with no Sales line in the same voucher are treated as advances. GST on
 * services advances is a live liability — flag taxable advances with no GST.
 */
export function computeGstAdvances(ds: Dataset): AdvanceRow[] {
  const byVoucher = new Map<string, DaybookLine[]>()
  for (const l of ds.lines) {
    let a = byVoucher.get(l.voucherGuid); if (!a) { a = []; byVoucher.set(l.voucherGuid, a) }
    a.push(l)
  }

  // sales by party (to distinguish advances from collections against invoices)
  const salesByParty = new Map<string, number>()
  for (const l of ds.lines) {
    if (l.category === 'income' && l.partyName) {
      salesByParty.set(l.partyName, (salesByParty.get(l.partyName) ?? 0) + Math.abs(l.amount))
    }
  }
  // also credit to a debtor party in Sales/Journal vouchers = invoice booked to them
  const billedByParty = new Map<string, number>()
  for (const l of ds.lines) {
    if (l.category === 'party' && l.drcr === 'Dr' && /sales|journal/i.test(l.voucherType)) {
      billedByParty.set(l.partyName || l.ledgerName, (billedByParty.get(l.partyName || l.ledgerName) ?? 0) + l.amount)
    }
  }
  const partyClosing = new Map(ds.parties.map((p) => [p.name, p.closingBalance]))

  const rows: AdvanceRow[] = []
  for (const [guid, lines] of byVoucher) {
    const head = lines[0]
    const isReceipt = /receipt/i.test(head.voucherType)
    const hasSales = lines.some((l) => l.category === 'income')
    if (!isReceipt || hasSales) continue

    // money received = debit to bank/cash
    const inflow = lines.filter((l) => l.category === 'bank_cash' && l.amount > 0).reduce((s, l) => s + l.amount, 0)
    // party credited
    const partyCredit = lines.filter((l) => l.category === 'party' && l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
    const amount = inflow || partyCredit
    if (amount <= 0) continue

    const party = head.partyName || lines.find((l) => l.category === 'party')?.ledgerName || '—'
    const gstBooked = gstInVoucher(lines)
    const narration = head.narration
    const exempt = EXEMPT_RE.test(`${party} ${narration}`)
    const gstExpected = exempt ? 0 : (amount * GST_ON_ADVANCE_RATE) / (100 + GST_ON_ADVANCE_RATE)

    const billed = billedByParty.get(party) ?? 0
    const closing = partyClosing.get(party) ?? 0
    const inCredit = closing < -1                 // party net over-paid = advance outstanding
    const hasInvoice = billed > amount * 0.5       // an invoice of comparable size was raised to this party
    // A receipt is only an ADVANCE if the party has no matching invoice, or is left in net credit.
    const isAdvance = inCredit || !hasInvoice
    const adjustedLater = hasInvoice && !inCredit
    const outstanding = inCredit

    let risk: AdvanceRisk = 'ok'
    let note = ''
    if (!isAdvance) {
      risk = 'ok'
      note = 'Collection against receivable (invoice raised) — not an advance'
    } else if (exempt) {
      risk = gstBooked > 0 ? 'ok' : 'low'
      note = gstBooked > 0 ? 'GST booked on likely-exempt receipt — verify' : 'Likely grant/donation/exempt — confirm no GST due'
    } else if (gstBooked <= 1) {
      risk = outstanding ? 'high' : 'medium'
      note = outstanding
        ? 'Taxable service advance outstanding with NO GST on advance booked'
        : 'Advance for taxable supply, no GST on advance booked (adjusted against later invoice)'
    } else if (gstBooked >= gstExpected * 0.9) {
      risk = 'ok'; note = 'GST on advance booked'
    } else {
      risk = 'medium'; note = 'GST on advance appears short'
    }

    rows.push({
      voucherGuid: guid, date: head.date, voucherNumber: head.voucherNumber, voucherType: head.voucherType,
      party, amount, gstBooked, gstExpected, adjustedLater, likelyExemptOrGrant: exempt, outstanding, risk, note,
    })
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  return rows
}

export const ADVANCE_RISK_META: Record<AdvanceRisk, { label: string; color: string }> = {
  ok: { label: 'OK', color: 'ok' },
  low: { label: 'Low', color: 'muted' },
  medium: { label: 'Medium', color: 'warn' },
  high: { label: 'High', color: 'risk' },
}
