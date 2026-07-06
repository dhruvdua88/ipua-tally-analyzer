import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { inrSymbol, inrCompact } from '@/lib/format'
import { Card } from './ui'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'

// ---- Money / clickable amount ------------------------------------------
export function Money({ value, className, decimals }: { value: number; className?: string; decimals?: number }) {
  const neg = value < 0
  return <span className={cn('num tabular-nums', neg ? 'text-risk' : '', className)}>{inrSymbol(value, decimals)}</span>
}

/** A clickable financial figure that opens a drilldown. */
export function TraceAmount({ value, onClick, className, compact, decimals }: {
  value: number; onClick?: () => void; className?: string; compact?: boolean; decimals?: number
}) {
  const txt = compact ? inrCompact(value) : inrSymbol(value, decimals)
  const neg = value < 0
  if (!onClick) return <span className={cn('num tabular-nums', neg && 'text-risk', className)}>{txt}</span>
  return (
    <button onClick={onClick}
      className={cn('num tabular-nums trace bg-transparent', neg && 'text-risk', className)}>
      {txt}
    </button>
  )
}

// ---- StatCard ----------------------------------------------------------
export function StatCard({ label, value, sub, tone, onClick, icon }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'risk' | 'info' | 'gold'; onClick?: () => void; icon?: ReactNode
}) {
  const toneRing: Record<string, string> = {
    ok: 'border-l-ok', warn: 'border-l-warn', risk: 'border-l-risk', info: 'border-l-info', gold: 'border-l-gold',
  }
  return (
    <Card
      onClick={onClick}
      className={cn('border-l-2 transition-all', tone ? toneRing[tone] : 'border-l-border',
        onClick && 'cursor-pointer hover:border-border hover:bg-surface2')}
    >
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-2xs uppercase tracking-wider text-muted font-medium">{label}</div>
          {icon && <div className="text-faint">{icon}</div>}
        </div>
        <div className="mt-1.5 text-lg font-semibold text-ink num tabular-nums leading-tight">{value}</div>
        {sub && <div className="mt-0.5 text-2xs text-faint">{sub}</div>}
      </div>
    </Card>
  )
}

// ---- DataTable ---------------------------------------------------------
export interface Column<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  sortValue?: (row: T) => number | string
  render: (row: T) => ReactNode
  className?: string
  width?: string
}
export function DataTable<T>({ columns, rows, keyFn, dense, pageSize = 100, maxHeight, stickyHeader = true }: {
  columns: Column<T>[]; rows: T[]; keyFn: (row: T, i: number) => string
  dense?: boolean; pageSize?: number; maxHeight?: string; stickyHeader?: boolean
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b)
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? r : -r
    })
    return arr
  }, [rows, sortKey, sortDir, columns])

  const pages = Math.ceil(sorted.length / pageSize)
  const view = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10', 'bg-surface2')}>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}
                  className={cn('px-3 py-2 text-2xs uppercase tracking-wider text-muted font-semibold border-b border-border select-none',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.sortValue && 'cursor-pointer hover:text-ink')}
                  onClick={() => c.sortValue && toggleSort(c.key)}>
                  <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header}
                    {c.sortValue && (sortKey === c.key
                      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                      : <ArrowUpDown size={11} className="opacity-30" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr key={keyFn(row, i)} className="border-b border-border/60 last:border-0 hover:bg-surface2/60 transition-colors">
                {columns.map((c) => (
                  <td key={c.key} className={cn(dense ? 'px-3 py-1.5' : 'px-3 py-2.5', 'text-ink align-top',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!view.length && (
              <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-faint text-sm">No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted bg-surface2/40">
          <span className="num">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface2">Prev</button>
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface2">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
