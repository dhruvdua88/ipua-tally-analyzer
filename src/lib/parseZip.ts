import JSZip from 'jszip'
import Papa from 'papaparse'
import type { RawTable } from './types'

const BOM = /^﻿/

/** Strip BOM + surrounding quotes from a header cell. */
function cleanHeader(h: string): string {
  return h.replace(BOM, '').trim().replace(/^"(.*)"$/, '$1').trim()
}

/**
 * Parse a single CSV string into a RawTable. Schema is inferred dynamically:
 * the first row is the header, all columns kept as strings. No fixed columns
 * are assumed anywhere.
 */
export function parseCsv(name: string, text: string): RawTable {
  const cleaned = text.replace(BOM, '')
  const res = Papa.parse<string[]>(cleaned, {
    skipEmptyLines: 'greedy',
  })
  const matrix = res.data as unknown as string[][]
  if (!matrix.length) return { name, headers: [], rows: [] }
  const headers = matrix[0].map(cleanHeader)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i]
    if (!r || r.every((c) => c == null || String(c).trim() === '')) continue
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = r[c] == null ? '' : String(r[c])
    }
    rows.push(obj)
  }
  return { name, headers, rows }
}

/** Extract every *.csv from a Tally-loader ZIP into RawTables. */
export async function parseZip(file: File | Blob | ArrayBuffer): Promise<RawTable[]> {
  const zip = await JSZip.loadAsync(file)
  const tables: RawTable[] = []
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && /\.csv$/i.test(f.name)
  )
  for (const entry of entries) {
    const text = await entry.async('string')
    const base = entry.name.split('/').pop()!.replace(/\.csv$/i, '')
    tables.push(parseCsv(base, text))
  }
  return tables
}

/** Also expose README parsing for company/period metadata if present. */
export async function readReadme(file: File | Blob | ArrayBuffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(file)
  const readme = Object.values(zip.files).find((f) => /readme/i.test(f.name) && !f.dir)
  return readme ? readme.async('string') : null
}
