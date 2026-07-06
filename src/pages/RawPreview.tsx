import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { PageHeader, Empty, Badge } from '@/components/ui'
import { StatCard, DataTable, type Column } from '@/components/shared'
import { cn } from '@/lib/cn'
import { Database, Table, Layers } from 'lucide-react'
import type { RawTable } from '@/lib/types'

const NUM_RE = /^-?[\d,]+(\.\d+)?$/

export function RawPreviewPage() {
  const ds = useStore((s) => s.dataset)
  const [selected, setSelected] = useState<string | null>(null)

  const tables = useMemo(
    () => (ds ? ds.raw.filter((t) => t.rows.length).sort((a, b) => b.rows.length - a.rows.length) : []),
    [ds],
  )
  const totalRows = useMemo(() => tables.reduce((s, t) => s + t.rows.length, 0), [tables])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export first." />

  const active: RawTable | undefined = tables.find((t) => t.name === selected) ?? tables[0]
  const largest = tables[0]

  const columns: Column<Record<string, string>>[] = active
    ? active.headers.map((h) => ({
        key: h,
        header: h,
        render: (row) => {
          const v = row[h] ?? ''
          return NUM_RE.test(v)
            ? <span className="block text-right num tabular-nums">{v}</span>
            : <span>{v}</span>
        },
      }))
    : []

  return (
    <div>
      <PageHeader title="Raw Tables" subtitle={`${ds.company} · parsed tally-database-loader CSV tables`} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Tables" value={tables.length} icon={<Table size={15} />} />
        <StatCard label="Total Rows" value={<span className="num tabular-nums">{totalRows.toLocaleString('en-IN')}</span>} icon={<Layers size={15} />} />
        <StatCard label="Largest Table" value={largest ? largest.name : '—'} sub={largest ? `${largest.rows.length.toLocaleString('en-IN')} rows` : undefined} icon={<Database size={15} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="divide-y divide-border/60 max-h-[70vh] overflow-auto">
            {tables.map((t) => {
              const on = active?.name === t.name
              return (
                <button key={t.name} onClick={() => setSelected(t.name)}
                  className={cn('w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                    on ? 'bg-surface2 text-ink' : 'hover:bg-surface2/60')}>
                  <span className="text-xs truncate">{t.name}</span>
                  <Badge color={on ? 'gold' : 'muted'}>{t.rows.length.toLocaleString('en-IN')}</Badge>
                </button>
              )
            })}
            {!tables.length && <div className="px-3 py-10 text-center text-faint text-sm">No non-empty tables</div>}
          </div>
        </div>

        <div>
          {active
            ? <DataTable columns={columns} rows={active.rows} keyFn={(_, i) => String(i)} dense pageSize={50} maxHeight="70vh" />
            : <Empty title="No table selected" />}
        </div>
      </div>
    </div>
  )
}
