// Validate the styled Excel exports end-to-end in Node (DOM polyfilled).
import { writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { parseZip } from '../src/lib/parseZip.ts'
import { normalize } from '../src/lib/normalize.ts'
import { computeTdsReview, DEFAULT_TDS_RULES } from '../src/lib/tds.ts'
import { computeMis } from '../src/lib/mis.ts'
import { computePnl, computeBs } from '../src/lib/pnlBs.ts'
import { readFile } from 'node:fs/promises'

// --- minimal DOM polyfills so lib/excel.ts save() runs headless ---
let captured: Blob | null = null
;(globalThis as any).document = {
  createElement: () => ({ click() {}, remove() {}, set href(_v: string) {}, set download(_v: string) {}, style: {} }),
  body: { appendChild() {}, removeChild() {} },
}
const U = globalThis.URL as any
U.createObjectURL = (b: Blob) => { captured = b; return 'blob:x' }
U.revokeObjectURL = () => {}

const { exportTds, exportMis } = await import('../src/lib/excel.ts')

const buf = await readFile('/Users/dhruvdua/tally-analyzer/public/sample/IPUA_sample_tally_export.zip')
const ds = normalize(await parseZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))

// 1) TDS export
await exportTds(computeTdsReview(ds, DEFAULT_TDS_RULES), ds.company)
if (!captured) throw new Error('TDS export produced no blob')
let ab = await (captured as Blob).arrayBuffer()
await writeFile('/tmp/ipua_tds_check.xlsx', Buffer.from(ab))
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(ab)
const ws = wb.worksheets[0]
const title = ws.getCell(1, 1)
const header = ws.getCell(4, 1)
console.log('TDS workbook sheets:', wb.worksheets.map((w) => w.name).join(', '))
const notSheet = wb.worksheets.find((w) => /Not Deducted/i.test(w.name))
let aldoviaFound = false
notSheet?.eachRow((row) => { if (String(row.getCell(4).value).toLowerCase().includes('aldovia')) aldoviaFound = true })
console.log('Aldovia in Not-Deducted sheet:', aldoviaFound)
console.log('TDS sheet:', ws.name, '| rows', ws.rowCount, '| cols', ws.columnCount)
console.log('title fill argb:', (title.fill as any)?.fgColor?.argb, '| frozen:', JSON.stringify(ws.views?.[0]))
console.log('header fill argb:', (header.fill as any)?.fgColor?.argb, '| bold:', (header.font as any)?.bold)
// find a money cell + a status cell
const amtCol = 5, statusCol = 10
console.log('money numFmt:', ws.getCell(5, amtCol).numFmt)
const statusCell = ws.getCell(5, statusCol)
console.log('status cell:', statusCell.value, '| fill:', (statusCell.fill as any)?.fgColor?.argb, '| autofilter:', JSON.stringify(ws.autoFilter))

// 2) MIS multi-sheet
captured = null
const mis = computeMis(ds); const pnl = computePnl(ds); const bs = computeBs(ds, pnl.surplus)
await exportMis(mis, pnl, bs, ds.company)
ab = await (captured! as Blob).arrayBuffer()
await writeFile('/tmp/ipua_mis_check.xlsx', Buffer.from(ab))
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(ab)
console.log('\nMIS workbook sheets:', wb2.worksheets.map((w) => w.name).join(', '))

// 3) Financial Statements
captured = null
const { computeStatements } = await import('../src/lib/statements.ts')
const { exportStatements } = await import('../src/lib/excel.ts')
await exportStatements(computeStatements(ds))
ab = await (captured! as Blob).arrayBuffer()
await writeFile('/tmp/ipua_financial_statements.xlsx', Buffer.from(ab))
const wb3 = new ExcelJS.Workbook(); await wb3.xlsx.load(ab)
console.log('\nFin Statements sheets:', wb3.worksheets.map((w) => w.name).join(', '))

console.log('\nEXCEL CHECK OK')
