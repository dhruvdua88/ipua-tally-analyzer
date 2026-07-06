import type { Dataset, ExceptionRow, TdsReviewRow, AdvanceRow, Severity } from './types'
import { daysBetween } from './format'

const OLD_ADVANCE_DAYS = 90

/**
 * Central exception engine. Consumes the already-computed TDS + advance rows so
 * results stay consistent with those modules, then adds ledger/voucher-level
 * anomaly checks.
 */
export function computeExceptions(ds: Dataset, tdsRows: TdsReviewRow[], advanceRows: AdvanceRow[]): ExceptionRow[] {
  const out: ExceptionRow[] = []
  const periodTo = ds.periodTo || (ds.lines.length ? ds.lines[ds.lines.length - 1].date : '')

  // 1) Missing / short TDS
  for (const r of tdsRows) {
    if (r.status === 'not_deducted') {
      out.push({ id: `tds-${r.lineId}`, type: 'missing_tds', severity: 'high',
        title: `TDS not deducted — ${r.ledger}`,
        detail: `${r.party}: ₹${r.amount.toLocaleString('en-IN')} expected ${r.expectedRate}% ${r.matchedSection}. ${r.note}`,
        amount: r.expectedTds, ref: `${r.voucherType} ${r.voucherNumber}`, lineId: r.lineId })
    } else if (r.status === 'short_deducted') {
      out.push({ id: `tds-${r.lineId}`, type: 'missing_tds', severity: 'medium',
        title: `Short TDS — ${r.ledger}`, detail: `${r.party}: ${r.note}`,
        amount: r.expectedTds - r.actualTds, ref: `${r.voucherType} ${r.voucherNumber}`, lineId: r.lineId })
    }
  }

  // 2) GST on advance
  for (const r of advanceRows) {
    if (r.risk === 'high' || r.risk === 'medium') {
      out.push({ id: `adv-${r.voucherGuid}`, type: 'gst_advance', severity: r.risk === 'high' ? 'high' : 'medium',
        title: `GST on advance — ${r.party}`, detail: r.note,
        amount: r.gstExpected, ref: `${r.voucherType} ${r.voucherNumber}`, voucherGuid: r.voucherGuid })
    }
    // 3) old outstanding advance
    if (r.outstanding && periodTo && daysBetween(r.date, periodTo) > OLD_ADVANCE_DAYS) {
      out.push({ id: `oldadv-${r.voucherGuid}`, type: 'old_advance', severity: 'medium',
        title: `Old outstanding advance — ${r.party}`,
        detail: `₹${r.amount.toLocaleString('en-IN')} received ${r.date}, ${daysBetween(r.date, periodTo)} days old, not adjusted`,
        amount: r.amount, ref: r.voucherNumber, voucherGuid: r.voucherGuid })
    }
  }

  // 4) Statutory / GST / TDS unpaid dues (credit closing balance)
  for (const led of ds.ledgers) {
    if (!['statutory', 'tds', 'gst'].includes(led.category)) continue
    if (led.subtype === 'gst_input' || led.subtype === 'tds_receivable') continue
    // Balances are conventional (Dr +, Cr −). A payable is a credit balance.
    const payable = -led.closingBalance
    if (payable > 100) {
      const sev: Severity = payable > 100000 ? 'high' : 'medium'
      out.push({ id: `stat-${led.name}`, type: 'statutory_unpaid', severity: sev,
        title: `Unpaid due — ${led.name}`, detail: `Closing payable balance ₹${payable.toLocaleString('en-IN')}`,
        amount: payable, ledgerName: led.name })
    }
  }

  // 5) Negative / reverse party balances
  for (const p of ds.parties) {
    const bal = p.closingBalance
    if (p.type === 'debtor' && bal < -1000) {
      out.push({ id: `negp-${p.name}`, type: 'negative_party', severity: 'medium',
        title: `Debtor in credit — ${p.name}`, detail: `Credit balance ₹${Math.abs(bal).toLocaleString('en-IN')} (advance / overpayment)`,
        amount: Math.abs(bal), ledgerName: p.name })
    } else if (p.type === 'creditor' && bal > 1000) {
      out.push({ id: `negp-${p.name}`, type: 'negative_party', severity: 'medium',
        title: `Creditor in debit — ${p.name}`, detail: `Debit balance ₹${bal.toLocaleString('en-IN')} (advance paid / overpayment)`,
        amount: bal, ledgerName: p.name })
    }
  }

  // 6) Unclassified ledgers with movement
  const moved = new Set(ds.lines.map((l) => l.ledgerName))
  for (const led of ds.ledgers) {
    if (led.category !== 'unclassified') continue
    if (!moved.has(led.name) && Math.abs(led.closingBalance) < 1) continue
    out.push({ id: `uncl-${led.name}`, type: 'unclassified_ledger', severity: 'low',
      title: `Unclassified ledger — ${led.name}`, detail: `Group "${led.primaryGroup}" — assign a category in Ledger Mapping`,
      ledgerName: led.name })
  }

  // 7) Manual journals (large)
  const jvTotals = new Map<string, { amt: number; count: number; guid: string; num: string; date: string; party: string }>()
  for (const l of ds.lines) {
    if (!/journal/i.test(l.voucherType)) continue
    let a = jvTotals.get(l.voucherGuid)
    if (!a) { a = { amt: 0, count: 0, guid: l.voucherGuid, num: l.voucherNumber, date: l.date, party: l.partyName }; jvTotals.set(l.voucherGuid, a) }
    if (l.amount > 0) a.amt += l.amount
    a.count++
  }
  for (const [, j] of jvTotals) {
    if (j.amt > 50000) {
      out.push({ id: `jv-${j.guid}`, type: 'manual_journal', severity: 'low',
        title: `Manual journal — #${j.num}`, detail: `${j.party || 'JV'} ₹${j.amt.toLocaleString('en-IN')} on ${j.date} — review supporting`,
        amount: j.amt, ref: `Journal ${j.num}`, voucherGuid: j.guid })
    }
  }

  // 8) Duplicate vouchers (same type+party+amount+date)
  const seen = new Map<string, { guid: string; num: string; type: string }>()
  const vAmt = new Map<string, { amt: number; date: string; type: string; num: string; party: string }>()
  for (const l of ds.lines) {
    let a = vAmt.get(l.voucherGuid)
    if (!a) { a = { amt: 0, date: l.date, type: l.voucherType, num: l.voucherNumber, party: l.partyName }; vAmt.set(l.voucherGuid, a) }
    if (l.amount > 0) a.amt += l.amount
  }
  for (const [guid, v] of vAmt) {
    const key = `${v.type}|${v.party}|${v.date}|${Math.round(v.amt)}`
    const prev = seen.get(key)
    if (prev) {
      out.push({ id: `dup-${guid}`, type: 'duplicate_voucher', severity: 'medium',
        title: `Possible duplicate — ${v.type} #${v.num}`,
        detail: `Same party, date & amount ₹${v.amt.toLocaleString('en-IN')} as ${v.type} #${prev.num}`,
        amount: v.amt, ref: `${v.type} ${v.num}`, voucherGuid: guid })
    } else {
      seen.set(key, { guid, num: v.num, type: v.type })
    }
  }

  // 9) Missing narration on payments/receipts/journals
  const vseen = new Set<string>()
  for (const l of ds.lines) {
    if (vseen.has(l.voucherGuid)) continue
    vseen.add(l.voucherGuid)
    if (!/payment|receipt|journal/i.test(l.voucherType)) continue
    if (!l.narration || !l.narration.trim()) {
      out.push({ id: `narr-${l.voucherGuid}`, type: 'missing_narration', severity: 'low',
        title: `Missing narration — ${l.voucherType} #${l.voucherNumber}`,
        detail: `${l.date}${l.partyName ? ' · ' + l.partyName : ''} — no narration`,
        ref: `${l.voucherType} ${l.voucherNumber}`, voucherGuid: l.voucherGuid })
    }
  }

  const sevRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.amount ?? 0) - (a.amount ?? 0))
  return out
}

export const EXCEPTION_META: Record<string, { label: string }> = {
  missing_tds: { label: 'Missing / Short TDS' },
  gst_advance: { label: 'GST on Advance' },
  statutory_unpaid: { label: 'Unpaid Statutory Dues' },
  old_advance: { label: 'Old Advances' },
  negative_party: { label: 'Reverse Party Balances' },
  manual_journal: { label: 'Manual Journals' },
  unclassified_ledger: { label: 'Unclassified Ledgers' },
  duplicate_voucher: { label: 'Duplicate Vouchers' },
  missing_narration: { label: 'Missing Narration' },
}
