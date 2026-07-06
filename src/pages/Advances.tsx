import { type ReactNode, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computeGstAdvances, ADVANCE_RISK_META } from '@/lib/gstAdvances'
import { exportGstAdvances } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { PageHeader, Card, Button, Badge, Input, Empty } from '@/components/ui'
import { StatCard, TraceAmount, Money, DataTable, type Column } from '@/components/shared'
import { dateLabel, inrCompact } from '@/lib/format'
import type { AdvanceRow, AdvanceRisk } from '@/lib/types'
import { Download, Info } from 'lucide-react'

type RiskFilter = AdvanceRisk | 'all'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-xs font-medium transition-colors',
        active ? 'bg-gold/15 text-gold border-gold/40' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
      {children}
    </button>
  )
}

export function AdvancesPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)

  const [risk, setRisk] = useState<RiskFilter>('all')
  const [outstandingOnly, setOutstandingOnly] = useState(false)
  const [exemptOnly, setExemptOnly] = useState(false)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => (ds ? computeGstAdvances(ds) : []), [ds])

  const totals = useMemo(() => {
    let amount = 0, gstBooked = 0, gstExpected = 0, high = 0, outstanding = 0, exempt = 0
    for (const r of rows) {
      amount += r.amount; gstBooked += r.gstBooked; gstExpected += r.gstExpected
      if (r.risk === 'high') high++
      if (r.outstanding) outstanding++
      if (r.likelyExemptOrGrant) exempt++
    }
    return { amount, gstBooked, gstExpected, gap: gstExpected - gstBooked, high, outstanding, exempt }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      (risk === 'all' || r.risk === risk) &&
      (!outstandingOnly || r.outstanding) &&
      (!exemptOnly || r.likelyExemptOrGrant) &&
      (!q || r.party.toLowerCase().includes(q)))
  }, [rows, risk, outstandingOnly, exemptOnly, search])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export to assess GST on advances." />

  const drill = (r: AdvanceRow) =>
    open({ title: `${r.voucherType} ${r.voucherNumber}`, subtitle: r.party, lines: ds.lines.filter((l) => l.voucherGuid === r.voucherGuid) })

  const columns: Column<AdvanceRow>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="text-muted whitespace-nowrap">{dateLabel(r.date)}</span> },
    { key: 'voucher', header: 'Voucher', render: (r) => <span className="whitespace-nowrap"><span className="text-muted">{r.voucherType}</span> <span className="num text-ink">#{r.voucherNumber}</span></span> },
    { key: 'party', header: 'Party', render: (r) => <span className="text-ink">{r.party}</span> },
    { key: 'amount', header: 'Advance Amt', align: 'right', sortValue: (r) => r.amount, render: (r) => <TraceAmount value={r.amount} onClick={() => drill(r)} /> },
    { key: 'gstBooked', header: 'GST Booked', align: 'right', sortValue: (r) => r.gstBooked, render: (r) => <Money value={r.gstBooked} /> },
    { key: 'gstExpected', header: 'GST Expected', align: 'right', sortValue: (r) => r.gstExpected, render: (r) => <Money value={r.gstExpected} /> },
    { key: 'adjusted', header: 'Adjusted Later', align: 'center', render: (r) => <Badge color={r.adjustedLater ? 'ok' : 'muted'}>{r.adjustedLater ? 'Yes' : 'No'}</Badge> },
    { key: 'outstanding', header: 'Outstanding', align: 'center', render: (r) => <Badge color={r.outstanding ? 'warn' : 'muted'}>{r.outstanding ? 'Yes' : 'No'}</Badge> },
    { key: 'exempt', header: 'Exempt/Grant', align: 'center', render: (r) => <Badge color={r.likelyExemptOrGrant ? 'info' : 'muted'}>{r.likelyExemptOrGrant ? 'Yes' : 'No'}</Badge> },
    { key: 'risk', header: 'Risk', align: 'center', render: (r) => <Badge color={ADVANCE_RISK_META[r.risk].color}>{ADVANCE_RISK_META[r.risk].label}</Badge> },
    { key: 'note', header: 'Note', render: (r) => <span className="text-2xs text-muted">{r.note}</span> },
  ]

  return (
    <div>
      <PageHeader title="GST on Advances" subtitle={`${ds.company} · ${rows.length} advance receipts`}
        right={<Button variant="outline" onClick={() => exportGstAdvances(rows, ds.company)}><Download size={15} /> Export advances</Button>} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Advances Received" tone="info" value={<TraceAmount value={totals.amount} compact onClick={() => setRisk('all')} />} sub={`${rows.length} receipts`} />
        <StatCard label="High Risk" tone="risk" value={totals.high} onClick={() => setRisk('high')} />
        <StatCard label="GST Booked" value={<TraceAmount value={totals.gstBooked} compact />} />
        <StatCard label="GST Expected" tone="warn" value={<TraceAmount value={totals.gstExpected} compact />} sub={`Gap ${inrCompact(totals.gap)}`} />
        <StatCard label="Outstanding" value={totals.outstanding} onClick={() => setOutstandingOnly((v) => !v)} />
        <StatCard label="Exempt / Grant" value={totals.exempt} onClick={() => setExemptOnly((v) => !v)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Chip active={risk === 'all'} onClick={() => setRisk('all')}>All</Chip>
        {(Object.keys(ADVANCE_RISK_META) as AdvanceRisk[]).map((k) => (
          <Chip key={k} active={risk === k} onClick={() => setRisk(k)}>
            <Badge color={ADVANCE_RISK_META[k].color}>{ADVANCE_RISK_META[k].label}</Badge>
          </Chip>
        ))}
        <Chip active={outstandingOnly} onClick={() => setOutstandingOnly((v) => !v)}>Outstanding only</Chip>
        <Chip active={exemptOnly} onClick={() => setExemptOnly((v) => !v)}>Exempt / grant only</Chip>
        <div className="grow" />
        <Input placeholder="Search party…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
      </div>

      {/* Explanatory callout */}
      <Card className="mt-4 border-l-2 border-l-warn">
        <div className="p-4 flex items-start gap-3">
          <Info size={16} className="text-warn shrink-0 mt-0.5" />
          <div className="text-xs text-muted leading-relaxed">
            GST on advances for services is a live liability; goods advances are exempt post-Nov-2017. High-risk = taxable service advance received with no GST and no invoice.
          </div>
        </div>
      </Card>

      {/* Advances table */}
      <div className="mt-4">
        <DataTable columns={columns} rows={filtered} keyFn={(r) => r.voucherGuid} maxHeight="60vh" />
      </div>
    </div>
  )
}
