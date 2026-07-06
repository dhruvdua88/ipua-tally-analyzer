import { type ReactNode, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computeTdsReview, DEFAULT_TDS_RULES, TDS_STATUS_META } from '@/lib/tds'
import { exportTds } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { PageHeader, Card, CardHeader, CardTitle, Button, Badge, Input, Select, Empty } from '@/components/ui'
import { StatCard, TraceAmount, Money, DataTable, type Column } from '@/components/shared'
import { dateLabel } from '@/lib/format'
import type { TdsReviewRow, TdsRule, TdsStatus } from '@/lib/types'
import { Download, SlidersHorizontal, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'

type StatusFilter = TdsStatus | 'all'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-xs font-medium transition-colors',
        active ? 'bg-gold/15 text-gold border-gold/40' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
      {children}
    </button>
  )
}

export function TdsPage() {
  const ds = useStore((s) => s.dataset)
  const rules = useStore((s) => s.tdsRules)
  const setTdsRules = useStore((s) => s.setTdsRules)
  const open = useStore((s) => s.openDrilldown)

  const [status, setStatus] = useState<StatusFilter>('all')
  const [section, setSection] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)

  const rows = useMemo(() => (ds ? computeTdsReview(ds, rules) : []), [ds, rules])

  const counts = useMemo(() => {
    const c: Record<TdsStatus, number> = { deducted: 0, not_deducted: 0, short_deducted: 0, below_threshold: 0, manual_review: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  const sections = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.matchedSection) set.add(r.matchedSection)
    return [...set].sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      (status === 'all' || r.status === status) &&
      (section === 'all' || r.matchedSection === section) &&
      (!q || r.party.toLowerCase().includes(q) || r.ledger.toLowerCase().includes(q)))
  }, [rows, status, section, search])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export to run the TDS review." />

  const drill = (r: TdsReviewRow) => {
    const guid = r.lineId.split('#')[0]
    open({ title: `${r.voucherType} ${r.voucherNumber}`, subtitle: r.party, lines: ds.lines.filter((l) => l.voucherGuid === guid) })
  }

  const updateRule = (id: string, patch: Partial<TdsRule>) =>
    setTdsRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const columns: Column<TdsReviewRow>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="text-muted whitespace-nowrap">{dateLabel(r.date)}</span> },
    { key: 'voucher', header: 'Voucher', render: (r) => <span className="whitespace-nowrap"><span className="text-muted">{r.voucherType}</span> <span className="num text-ink">{r.voucherNumber}</span></span> },
    { key: 'party', header: 'Party', render: (r) => <span className="text-ink">{r.party}</span> },
    { key: 'ledger', header: 'Ledger', render: (r) => <span className="text-muted">{r.ledger}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <TraceAmount value={r.amount} onClick={() => drill(r)} /> },
    { key: 'section', header: 'Section', align: 'center', render: (r) => r.matchedSection ? <Badge color="info">{r.matchedSection}</Badge> : <span className="text-faint text-2xs">—</span> },
    { key: 'expTds', header: 'Expected TDS', align: 'right', sortValue: (r) => r.expectedTds, render: (r) => <Money value={r.expectedTds} /> },
    { key: 'actTds', header: 'Actual TDS', align: 'right', sortValue: (r) => r.actualTds, render: (r) => <Money value={r.actualTds} /> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <Badge color={TDS_STATUS_META[r.status].color}>{TDS_STATUS_META[r.status].label}</Badge> },
    { key: 'note', header: 'Note', render: (r) => <span className="text-2xs text-muted">{r.note}</span> },
  ]

  return (
    <div>
      <PageHeader title="TDS Review" subtitle={`${ds.company} · ${rows.length} expense lines reviewed`}
        right={<Button variant="outline" onClick={() => exportTds(rows, ds.company)}><Download size={15} /> Export TDS</Button>} />

      {/* Stat cards — each sets the status filter */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Lines Reviewed" value={rows.length} onClick={() => setStatus('all')} />
        <StatCard label="Not Deducted" tone="risk" value={counts.not_deducted} onClick={() => setStatus('not_deducted')} />
        <StatCard label="Short Deducted" tone="warn" value={counts.short_deducted} onClick={() => setStatus('short_deducted')} />
        <StatCard label="Deducted" tone="ok" value={counts.deducted} onClick={() => setStatus('deducted')} />
        <StatCard label="Below Threshold" value={counts.below_threshold} onClick={() => setStatus('below_threshold')} />
        <StatCard label="Manual Review" tone="info" value={counts.manual_review} onClick={() => setStatus('manual_review')} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>All</Chip>
        {(Object.keys(TDS_STATUS_META) as TdsStatus[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            <Badge color={TDS_STATUS_META[s].color}>{TDS_STATUS_META[s].label}</Badge>
          </Chip>
        ))}
        <div className="grow" />
        <Select value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="all">All sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input placeholder="Search party / ledger…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
      </div>

      {/* Editable TDS rules */}
      <Card className="mt-4">
        <CardHeader className="cursor-pointer" onClick={() => setRulesOpen((o) => !o)}>
          <CardTitle className="flex items-center gap-2">
            {rulesOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <SlidersHorizontal size={14} /> TDS rules
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setTdsRules(DEFAULT_TDS_RULES) }}>
            <RotateCcw size={13} /> Reset to defaults
          </Button>
        </CardHeader>
        {rulesOpen && (
          <div>
            <div className="px-3 py-2 grid grid-cols-12 gap-2 text-2xs uppercase tracking-wider text-muted font-semibold bg-surface2/40 border-b border-border">
              <div className="col-span-3">Section</div>
              <div className="col-span-2 text-right">Rate %</div>
              <div className="col-span-2 text-right">Threshold ₹</div>
              <div className="col-span-5">Keywords (comma-separated)</div>
            </div>
            {rules.map((rule) => (
              <div key={rule.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center border-b border-border/60 last:border-0">
                <label className="col-span-3 flex items-center gap-2 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={rule.enabled} onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })} className="accent-gold shrink-0" />
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-ink">{rule.section}</span>
                    <span className="block text-2xs text-muted truncate">{rule.label}</span>
                  </span>
                </label>
                <div className="col-span-2">
                  <Input type="number" step="0.1" value={rule.rate} onChange={(e) => updateRule(rule.id, { rate: Number(e.target.value) || 0 })} className="w-full text-right num" />
                </div>
                <div className="col-span-2">
                  <Input type="number" value={rule.threshold} onChange={(e) => updateRule(rule.id, { threshold: Number(e.target.value) || 0 })} className="w-full text-right num" />
                </div>
                <div className="col-span-5">
                  <Input value={rule.keywords.join(', ')}
                    onChange={(e) => updateRule(rule.id, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                    className="w-full" />
                </div>
              </div>
            ))}
            <div className="px-3 py-2 text-2xs text-faint">Changes re-run the review live — the table below updates as you edit rates, thresholds, keywords or toggle sections.</div>
          </div>
        )}
      </Card>

      {/* Review table */}
      <div className="mt-4">
        <DataTable columns={columns} rows={filtered} keyFn={(r) => r.lineId} maxHeight="60vh" />
      </div>
    </div>
  )
}
