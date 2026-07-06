// Indian-format number + date helpers.

/** Parse a Tally amount cell: TEXT with comma separators, may be blank. */
export function parseAmount(v: unknown): number {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s) return 0
  const n = Number(s.replace(/,/g, '').replace(/[₹\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Indian grouping, 2 decimals, e.g. 12,34,567.89 */
export function inr(n: number, opts?: { decimals?: number; sign?: boolean }): string {
  const decimals = opts?.decimals ?? 2
  if (!Number.isFinite(n)) return '—'
  const neg = n < 0
  const abs = Math.abs(n)
  const fixed = abs.toFixed(decimals)
  const [intPart, dec] = fixed.split('.')
  // Indian grouping: last 3 digits, then pairs
  let out = intPart
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3)
    const rest = intPart.slice(0, -3)
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }
  const body = dec ? `${out}.${dec}` : out
  const s = neg ? `-${body}` : opts?.sign && n > 0 ? `+${body}` : body
  return s
}

/** Compact Indian units: ₹1.23 Cr / ₹4.56 L / ₹7,890 */
export function inrCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)} K`
  return `${sign}₹${abs.toFixed(0)}`
}

export function inrSymbol(n: number, decimals = 2): string {
  const neg = n < 0
  return `${neg ? '-' : ''}₹${inr(Math.abs(n), { decimals })}`
}

/** YYYY-MM -> "Apr 2026" */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym || '—'
  const [y, m] = ym.split('-')
  const mi = Number(m) - 1
  return `${MONTHS[mi] ?? m} ${y}`
}

/** YYYY-MM-DD -> "02 Apr 2026" */
export function dateLabel(d: string): string {
  if (!d || d.length < 10) return d || '—'
  const [y, m, day] = d.split('-')
  return `${day} ${MONTHS[Number(m) - 1] ?? m} ${y}`
}

export function pct(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

/** stable-ish daysBetween for two YYYY-MM-DD strings */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(a), db = Date.parse(b)
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.round((db - da) / 86400000)
}
