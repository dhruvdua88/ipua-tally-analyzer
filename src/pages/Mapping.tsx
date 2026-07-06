import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { PageHeader, Button, Badge, Input, Select, Empty } from '@/components/ui'
import { TraceAmount, DataTable, type Column } from '@/components/shared'
import { CATEGORY_META, ALL_CATEGORIES } from '@/lib/classify'
import { exportLedgerMapping, exportDatabase } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { Download, Database, RotateCcw } from 'lucide-react'
import type { Ledger, LedgerCategory, LedgerSubtype } from '@/lib/types'

function Chip({ active, onClick, color, label, count }: {
  active: boolean; onClick: () => void; color: string; label: string; count: number
}) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-xs font-medium transition-colors',
        active ? 'border-gold bg-gold/10 text-ink' : 'border-border text-muted hover:bg-surface2')}>
      {label}
      <Badge color={color}>{count}</Badge>
    </button>
  )
}

export function MappingPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)
  const setOverride = useStore((s) => s.setOverride)
  const autoReclassify = useStore((s) => s.autoReclassify)

  const [catFilter, setCatFilter] = useState<LedgerCategory | 'all'>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c = {} as Record<LedgerCategory, number>
    for (const cat of ALL_CATEGORIES) c[cat] = 0
    if (ds) for (const l of ds.ledgers) c[l.category] = (c[l.category] ?? 0) + 1
    return c
  }, [ds])

  const filtered = useMemo(() => {
    if (!ds) return []
    const q = search.trim().toLowerCase()
    return ds.ledgers.filter((l) => {
      if (catFilter !== 'all' && l.category !== catFilter) return false
      if (q && !l.name.toLowerCase().includes(q) && !l.parent.toLowerCase().includes(q)) return false
      return true
    })
  }, [ds, catFilter, search])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export first." />

  const columns: Column<Ledger>[] = [
    {
      key: 'name', header: 'Ledger', sortValue: (l) => l.name,
      render: (l) => <span className="font-medium text-ink">{l.name}</span>,
    },
    {
      key: 'group', header: 'Group', sortValue: (l) => l.parent,
      render: (l) => <span className="text-muted">{l.parent || '—'}</span>,
    },
    {
      key: 'primary', header: 'Primary Group', sortValue: (l) => l.primaryGroup,
      render: (l) => <span className="text-muted">{l.primaryGroup || '—'}</span>,
    },
    {
      key: 'category', header: 'Category', width: '260px',
      render: (l) => (
        <div>
          <Select value={l.category} className="h-8 text-xs w-full"
            onChange={(e) => {
              const newCat = e.target.value as LedgerCategory
              const sub: LedgerSubtype = newCat === l.category ? l.subtype : 'unclassified'
              setOverride(l.name, newCat, sub)
            }}>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
          </Select>
          <div className="text-2xs text-faint mt-0.5 max-w-[240px] truncate" title={l.reason}>{l.reason}</div>
        </div>
      ),
    },
    {
      key: 'source', header: 'Source', align: 'center', sortValue: (l) => l.source,
      render: (l) => <Badge color={l.source === 'manual' ? 'gold' : 'muted'}>{l.source}</Badge>,
    },
    {
      key: 'closing', header: 'Closing', align: 'right', sortValue: (l) => l.closingBalance,
      render: (l) => (
        <TraceAmount value={l.closingBalance}
          onClick={() => open({ title: l.name, subtitle: l.parent, lines: ds.lines.filter((ln) => ln.ledgerName === l.name) })} />
      ),
    },
    {
      key: 'actions', header: '', align: 'center', width: '48px',
      render: (l) => l.source === 'manual'
        ? <Button size="sm" variant="ghost" onClick={() => autoReclassify(l.name)} title="Reset to auto-classification"><RotateCcw size={13} /></Button>
        : null,
    },
  ]

  return (
    <div>
      <PageHeader title="Ledger Mapping"
        subtitle={`${ds.ledgers.length} ledgers · review and override the auto-classification`}
        right={<>
          <Button variant="outline" onClick={() => exportLedgerMapping(ds)}><Download size={15} /> Export mapping</Button>
          <Button variant="outline" onClick={() => exportDatabase(ds)}><Database size={15} /> Export normalized DB</Button>
        </>} />

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <Chip active={catFilter === 'all'} onClick={() => setCatFilter('all')} color="muted" label="All" count={ds.ledgers.length} />
        {ALL_CATEGORIES.map((c) => (
          <Chip key={c} active={catFilter === c} onClick={() => setCatFilter(c)}
            color={CATEGORY_META[c].color} label={CATEGORY_META[c].label} count={counts[c]} />
        ))}
      </div>

      <div className="mb-3">
        <Input placeholder="Search ledger or group…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full md:w-80" />
      </div>

      <DataTable columns={columns} rows={filtered} keyFn={(l) => l.name} pageSize={50} maxHeight="66vh" />
    </div>
  )
}
