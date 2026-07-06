import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computeTdsReview } from '@/lib/tds'
import { computeGstAdvances } from '@/lib/gstAdvances'
import { computeExceptions, EXCEPTION_META } from '@/lib/exceptions'
import { exportExceptions } from '@/lib/excel'
import { PageHeader, Card, Button, Empty, Badge, Input } from '@/components/ui'
import { StatCard, Money } from '@/components/shared'
import { cn } from '@/lib/cn'
import type { ExceptionRow, ExceptionType, Severity } from '@/lib/types'
import { Download, ShieldAlert, AlertTriangle, Info } from 'lucide-react'

const SEV_COLOR: Record<Severity, string> = { high: 'risk', medium: 'warn', low: 'muted' }

export function ExceptionsPage() {
  const ds = useStore((s) => s.dataset)
  const rules = useStore((s) => s.tdsRules)
  const open = useStore((s) => s.openDrilldown)

  const ex = useMemo(() => {
    if (!ds) return []
    const tds = computeTdsReview(ds, rules)
    const adv = computeGstAdvances(ds)
    return computeExceptions(ds, tds, adv)
  }, [ds, rules])

  const [sevFilter, setSevFilter] = useState<Severity | null>(null)
  const [typeFilter, setTypeFilter] = useState<ExceptionType | null>(null)
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 }
    const byType = new Map<ExceptionType, number>()
    for (const e of ex) {
      c[e.severity]++
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
    }
    return { c, byType }
  }, [ex])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export to see flagged exceptions." />

  const q = search.trim().toLowerCase()
  const rows = ex.filter((r) =>
    (!sevFilter || r.severity === sevFilter) &&
    (!typeFilter || r.type === typeFilter) &&
    (!q || `${r.title} ${r.detail} ${r.ref ?? ''} ${r.ledgerName ?? ''}`.toLowerCase().includes(q)))

  const clickable = (r: ExceptionRow) => !!(r.voucherGuid || r.ledgerName || r.lineId)
  const openRow = (r: ExceptionRow) => {
    if (r.voucherGuid) open({ title: r.title, subtitle: r.ref, lines: ds.lines.filter((l) => l.voucherGuid === r.voucherGuid) })
    else if (r.ledgerName) open({ title: r.title, subtitle: r.ledgerName, lines: ds.lines.filter((l) => l.ledgerName === r.ledgerName) })
    else if (r.lineId) { const g = r.lineId.split('#')[0]; open({ title: r.title, subtitle: r.ref, lines: ds.lines.filter((l) => l.voucherGuid === g) }) }
  }

  const toggleSev = (s: Severity) => setSevFilter((cur) => (cur === s ? null : s))
  const toggleType = (t: ExceptionType) => setTypeFilter((cur) => (cur === t ? null : t))

  const typeKeys = (Object.keys(EXCEPTION_META) as ExceptionType[]).filter((t) => (counts.byType.get(t) ?? 0) > 0)

  return (
    <div>
      <PageHeader title="Exceptions" subtitle={`${ds.company} · ${ex.length} flagged`}
        right={<Button variant="outline" onClick={() => exportExceptions(ex, ds.company)}><Download size={15} /> Export exceptions</Button>} />

      {/* Severity summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="High" tone="risk" icon={<ShieldAlert size={15} />} value={counts.c.high}
          sub={sevFilter === 'high' ? 'Filtering' : 'Click to filter'} onClick={() => toggleSev('high')} />
        <StatCard label="Medium" tone="warn" icon={<AlertTriangle size={15} />} value={counts.c.medium}
          sub={sevFilter === 'medium' ? 'Filtering' : 'Click to filter'} onClick={() => toggleSev('medium')} />
        <StatCard label="Low" icon={<Info size={15} />} value={counts.c.low}
          sub={sevFilter === 'low' ? 'Filtering' : 'Click to filter'} onClick={() => toggleSev('low')} />
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button onClick={() => setTypeFilter(null)}
          className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            typeFilter === null ? 'bg-gold/15 text-gold border-gold/30' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
          All types <span className="num">{ex.length}</span>
        </button>
        {typeKeys.map((t) => (
          <button key={t} onClick={() => toggleType(t)}
            className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
              typeFilter === t ? 'bg-gold/15 text-gold border-gold/30' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
            {EXCEPTION_META[t].label} <span className="num text-faint">{counts.byType.get(t)}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mt-4">
        <Input placeholder="Search exceptions…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full md:w-80" />
      </div>

      {/* List */}
      <div className="mt-3 space-y-2">
        {rows.map((r) => {
          const can = clickable(r)
          const inner = (
            <div className="flex items-start justify-between gap-4 p-3.5">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex flex-col gap-1 shrink-0">
                  <Badge color={SEV_COLOR[r.severity]}>{r.severity}</Badge>
                  <Badge color="muted">{EXCEPTION_META[r.type]?.label ?? r.type}</Badge>
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{r.title}</div>
                  <div className="text-xs text-muted mt-0.5">{r.detail}</div>
                  {r.ref && <div className="text-2xs text-faint mt-0.5">{r.ref}</div>}
                </div>
              </div>
              {r.amount != null && <Money value={r.amount} className="text-sm shrink-0" />}
            </div>
          )
          return can ? (
            <Card key={r.id} className="cursor-pointer hover:bg-surface2/60 transition-colors">
              <button onClick={() => openRow(r)} className="w-full text-left">{inner}</button>
            </Card>
          ) : (
            <Card key={r.id}>{inner}</Card>
          )
        })}
        {!rows.length && (
          <div className="py-16 text-center text-faint text-sm">No matching exceptions</div>
        )}
      </div>
    </div>
  )
}
