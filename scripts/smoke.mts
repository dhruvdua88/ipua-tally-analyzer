// End-to-end smoke test of the analytic pipeline against the bundled sample.
import { readFile } from 'node:fs/promises'
import { parseZip } from '../src/lib/parseZip.ts'
import { normalize } from '../src/lib/normalize.ts'
import { computeTdsReview, DEFAULT_TDS_RULES } from '../src/lib/tds.ts'
import { computeGstAdvances } from '../src/lib/gstAdvances.ts'
import { computeGstRecon } from '../src/lib/gstRecon.ts'
import { computePnl, computeBs } from '../src/lib/pnlBs.ts'
import { computeExceptions } from '../src/lib/exceptions.ts'
import { computeMis } from '../src/lib/mis.ts'

const buf = await readFile('/Users/dhruvdua/tally-analyzer/public/sample/IPUA_sample_tally_export.zip')
const tables = await parseZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const ds = normalize(tables)

const f = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

console.log('== NORMALIZE ==')
console.log('company', ds.company, '| period', ds.periodFrom, '->', ds.periodTo)
console.log('tables', tables.length, '| ledgers', ds.ledgers.length, '| groups', ds.groups.length,
  '| vouchers', ds.vouchers.length, '| lines', ds.lines.length, '| parties', ds.parties.length)

const catCount: Record<string, number> = {}
for (const l of ds.ledgers) catCount[l.category] = (catCount[l.category] ?? 0) + 1
console.log('classification', catCount)

// balance check: sum of all line amounts should be ~0 (Tally double entry)
const netAll = ds.lines.reduce((s, l) => s + l.amount, 0)
console.log('daybook net (expect ~0):', netAll.toFixed(2))

const mis = computeMis(ds)
console.log('\n== MIS ==')
console.log('income', f(mis.totalIncome), '| expense', f(mis.totalExpense), '| surplus', f(mis.surplus))
console.log('receivables', f(mis.receivables), '| payables', f(mis.payables),
  '| cashBank', f(mis.cashBank), '| statutory', f(mis.statutoryDues))

const pnl = computePnl(ds)
const bs = computeBs(ds, pnl.surplus)
console.log('\n== P&L / BS ==')
console.log('P&L income nodes', pnl.income.length, '| expense nodes', pnl.expense.length, '| surplus', f(pnl.surplus))
console.log('BS assets', f(bs.totalAssets), '| liab+eq', f(bs.totalLiabilities), '| diff', f(bs.difference))

const tds = computeTdsReview(ds, DEFAULT_TDS_RULES)
const tdsBy: Record<string, number> = {}
for (const r of tds) tdsBy[r.status] = (tdsBy[r.status] ?? 0) + 1
const tdsDeductedTot = tds.filter((r) => r.status === 'deducted').reduce((s, r) => s + r.tdsAmount, 0)
console.log('\n== TDS ==', 'rows', tds.length, tdsBy, '| total TDS deducted', f(tdsDeductedTot))
console.log('  deducted sample:', tds.filter((r) => r.status === 'deducted').slice(0, 2).map((r) => `${r.ledger} ${f(r.amount)} -> TDS ${f(r.tdsAmount)} @${r.rate}% ${r.section ?? ''}`))
const aldovia = tds.find((r) => /aldovia/i.test(r.ledger))
console.log('  ALDOVIA:', aldovia ? `${aldovia.status} | ${f(aldovia.amount)} | ${aldovia.voucherType} #${aldovia.voucherNumber} | ${aldovia.note}` : 'NOT FOUND')

const adv = computeGstAdvances(ds)
const advBy: Record<string, number> = {}
for (const r of adv) advBy[r.risk] = (advBy[r.risk] ?? 0) + 1
console.log('== GST ADVANCES ==', 'rows', adv.length, advBy, '| total recd', f(adv.reduce((s, r) => s + r.amount, 0)))

const gst = computeGstRecon(ds)
console.log('== GST RECON == months', gst.length)
for (const m of gst) console.log('  ', m.month, 'out', f(m.outputGst), 'in', f(m.inputGst), 'rcm', f(m.rcm), 'flags:', m.flags.join(',') || '-')

const ex = computeExceptions(ds, tds, adv)
const exBy: Record<string, number> = {}
for (const e of ex) exBy[e.severity] = (exBy[e.severity] ?? 0) + 1
const exType: Record<string, number> = {}
for (const e of ex) exType[e.type] = (exType[e.type] ?? 0) + 1
console.log('\n== EXCEPTIONS ==', 'total', ex.length, exBy)
console.log('by type', exType)
console.log('\ntop 3 exceptions:')
for (const e of ex.slice(0, 3)) console.log('  [' + e.severity + ']', e.title, '—', e.detail.slice(0, 80))

console.log('\nSMOKE OK')
