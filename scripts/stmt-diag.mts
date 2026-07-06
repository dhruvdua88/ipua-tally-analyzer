import { readFile } from 'node:fs/promises'
import { parseZip } from '../src/lib/parseZip.ts'
import { normalize } from '../src/lib/normalize.ts'
import { computeStatements } from '../src/lib/statements.ts'

const buf = await readFile('/Users/dhruvdua/tally-analyzer/public/sample/IPUA_sample_tally_export.zip')
const ds = normalize(await parseZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
const f = (n: number) => (n < 0 ? '-' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN')
const s = computeStatements(ds)

console.log('== BALANCE SHEET ==')
for (const l of s.bs.equityLiab) console.log(`  ${l.bold ? '▸ ' : '  '}${l.label.padEnd(40)} ${Number.isNaN(l.amount) ? '' : f(l.amount).padStart(16)}`)
console.log('')
for (const l of s.bs.assets) console.log(`  ${l.bold ? '▸ ' : '  '}${l.label.padEnd(40)} ${Number.isNaN(l.amount) ? '' : f(l.amount).padStart(16)}`)
console.log(`\n  TOTAL ASSETS ${f(s.bs.totalAssets)} | TOTAL E&L ${f(s.bs.totalEquityLiab)} | PLUG ${f(s.bs.plug)} (${s.bs.plugPct.toFixed(2)}%)`)

console.log('\n== P&L ==')
for (const l of s.pnl) console.log(`  ${l.bold ? '▸ ' : '  '}${l.label.padEnd(40)} ${Number.isNaN(l.amount) ? '' : f(l.amount).padStart(16)}`)
console.log('  PAT vs P&L A/c CY profit:', f(s.pnlSummary.pat), 'vs', f(s.pnlSummary.currentYearProfit))

console.log('\n== NOTES ==', s.notes.length)
for (const n of s.notes) console.log(`  Note ${n.no} ${n.title.padEnd(34)} total ${f(n.total).padStart(16)}  (${n.rows.length} rows)`)

console.log('\n== VALIDATIONS ==')
for (const v of s.validations) console.log(`  [${v.severity}] ${v.category}: ${v.message}`)
