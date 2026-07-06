import { readFile } from 'node:fs/promises'
import { parseZip } from '../src/lib/parseZip.ts'
import { normalize } from '../src/lib/normalize.ts'
import { computePnl, computeBs } from '../src/lib/pnlBs.ts'

const buf = await readFile('/Users/dhruvdua/tally-analyzer/public/sample/IPUA_sample_tally_export.zip')
const ds = normalize(await parseZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
const f = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

// Trial balance: sum of all closing balances (conventional Dr+/Cr-) should be ~0
const tb = ds.ledgers.reduce((s, l) => s + l.closingBalance, 0)
console.log('Ledgers:', ds.ledgers.length, '| TB sum (expect ~0):', f(tb))

// opening sum
const ob = ds.ledgers.reduce((s, l) => s + l.openingBalance, 0)
console.log('Opening sum (expect ~0):', f(ob))

// by category: sum closing + count with nonzero closing
const byCat: Record<string, { sum: number; n: number }> = {}
for (const l of ds.ledgers) {
  if (Math.abs(l.closingBalance) < 0.5) continue
  const c = byCat[l.category] ?? { sum: 0, n: 0 }
  c.sum += l.closingBalance; c.n++
  byCat[l.category] = c
}
console.log('\nClosing by category (Dr+ / Cr-):')
for (const [k, v] of Object.entries(byCat).sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum)))
  console.log(`  ${k.padEnd(18)} ${f(v.sum).padStart(16)}  (${v.n})`)

const pnl = computePnl(ds)
const bs = computeBs(ds, pnl.surplus)
console.log('\nP&L surplus (from line movements):', f(pnl.surplus))
// P&L from closing balances of income/expense ledgers
const incClose = ds.ledgers.filter((l) => l.category === 'income').reduce((s, l) => s + l.closingBalance, 0)
const expClose = ds.ledgers.filter((l) => l.category === 'expense').reduce((s, l) => s + l.closingBalance, 0)
console.log('Income closing (Cr, expect -ve):', f(incClose), '| Expense closing (Dr, +ve):', f(expClose))
console.log('Surplus from closing (=-inc-exp):', f(-incClose - expClose))
console.log('\nBS assets:', f(bs.totalAssets), '| liab+eq:', f(bs.totalLiabilities), '| surplus:', f(bs.surplus), '| diff:', f(bs.difference))

// what categories go asset vs liab in computeBs
console.log('\nCheck: assets(Dr cats) - liabilities(Cr cats) - surplus should ~ 0 if TB ties')
