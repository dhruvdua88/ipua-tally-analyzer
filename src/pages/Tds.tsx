import { type ReactNode, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computeTdsReview } from '@/lib/tds'
import { exportTds } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { PageHeader, Button, Badge, Input, Empty } from '@/components/ui'
import { StatCard, TraceAmount, Money, DataTable, type Column } from '@/components/shared'
import { dateLabel, pct } from '@/lib/format'
import type { TdsReviewRow, TdsStatus } from '@/lib/types'
import { Download, Receipt, AlertTriangle } from 'lucide-react'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm font-medium transition-colors',
        active ? 'bg-gold/15 text-gold border-gold/40' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
      {children}
    </button>
  )
}

export function TdsPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)
  const [tab, setTab] = useState<TdsStatus>('deducted')
  const [q, setQ] = useState('')

  const all = useMemo(() => (ds ? computeTdsReview(ds) : []), [ds])
  const deducted = useMemo(() => all.filter((r) => r.status === 'deducted'), [all])
  const notDeducted = useMemo(() => all.filter((r) => r.status === 'not_deducted'), [all])

  const rows = useMemo(() => {
    const base = tab === 'deducted' ? deducted : notDeducted
    if (!q.trim()) return base
    const s = q.toLowerCase()
    return base.filter((r) => `${r.party} ${r.ledger} ${r.narration} ${r.voucherNumber}`.toLowerCase().includes(s))
  }, [tab, deducted, notDeducted, q])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export first." />

  const totalTds = deducted.reduce((s, r) => s + r.tdsAmount, 0)
  const totalBase = deducted.reduce((s, r) => s + r.amount, 0)
  const notDeductedAmt = notDeducted.reduce((s, r) => s + r.amount, 0)

  const drill = (r: TdsReviewRow) =>
    open({ title: `${r.voucherType} #${r.voucherNumber}`, subtitle: `${r.party} · ${dateLabel(r.date)}`,
      lines: ds.lines.filter((l) => l.voucherGuid === r.lineId.split('#')[0]) })

  const deductedCols: Column<TdsReviewRow>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="text-muted whitespace-nowrap">{dateLabel(r.date)}</span> },
    { key: 'voucher', header: 'Voucher', render: (r) => <span className="whitespace-nowrap"><Badge color="muted">{r.voucherType}</Badge> <span className="num text-faint">#{r.voucherNumber}</span></span> },
    { key: 'party', header: 'Party', render: (r) => <span className="text-ink">{r.party}</span> },
    { key: 'ledger', header: 'Base Ledger', render: (r) => <span className="text-ink">{r.ledger}</span> },
    { key: 'amount', header: 'Base Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <TraceAmount value={r.amount} onClick={() => drill(r)} /> },
    { key: 'tdsLedger', header: 'TDS Ledger', render: (r) => <span className="text-muted text-xs">{r.tdsLedger}</span> },
    { key: 'tdsAmount', header: 'TDS Deducted', align: 'right', sortValue: (r) => r.tdsAmount, render: (r) => <Money value={r.tdsAmount} className="text-ok" /> },
    { key: 'rate', header: 'Rate', align: 'right', sortValue: (r) => r.rate, render: (r) => <span className="num text-ink">{pct(r.rate)}</span> },
    { key: 'section', header: 'Section', align: 'center', render: (r) => r.section ? <Badge color="info">{r.section}</Badge> : <span className="text-faint">—</span> },
  ]

  const missCols: Column<TdsReviewRow>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="text-muted whitespace-nowrap">{dateLabel(r.date)}</span> },
    { key: 'voucher', header: 'Voucher', render: (r) => <span className="whitespace-nowrap"><Badge color="muted">{r.voucherType}</Badge> <span className="num text-faint">#{r.voucherNumber}</span></span> },
    { key: 'party', header: 'Party', render: (r) => <span className="text-ink">{r.party}</span> },
    { key: 'ledger', header: 'Ledger', render: (r) => <span className="text-ink">{r.ledger}</span> },
    { key: 'amount', header: 'Amount Paid', align: 'right', sortValue: (r) => r.amount, render: (r) => <TraceAmount value={r.amount} onClick={() => drill(r)} /> },
    { key: 'note', header: 'Why flagged', render: (r) => <span className="text-faint text-xs">{r.note}</span> },
  ]

  return (
    <div>
      <PageHeader title="TDS Register" subtitle="Every TDS deduction, keyed off the TDS ledger — plus vendor payments & advances where no TDS was deducted."
        right={<Button variant="outline" onClick={() => exportTds(all, ds.company)}><Download size={15} /> Export TDS</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="TDS Deducted" tone="ok" icon={<Receipt size={15} />}
          value={<TraceAmount value={totalTds} compact onClick={() => open({ title: 'All TDS-deducted vouchers', lines: ds.lines.filter((l) => l.category === 'tds') })} />}
          sub={`${deducted.length} transactions`} />
        <StatCard label="Base Value" value={<Money value={totalBase} className="text-base" />} sub="on which TDS deducted" />
        <StatCard label="Not Deducted" tone="risk" icon={<AlertTriangle size={15} />}
          value={notDeducted.length} sub={`vendor payments / advances`} />
        <StatCard label="Exposure" tone="warn" value={<Money value={notDeductedAmt} className="text-base" />} sub="paid without TDS" />
      </div>

      <div className="flex items-center gap-2 mt-5 mb-3 flex-wrap">
        <Chip active={tab === 'deducted'} onClick={() => setTab('deducted')}><Receipt size={14} /> TDS Deducted <span className="num opacity-70">{deducted.length}</span></Chip>
        <Chip active={tab === 'not_deducted'} onClick={() => setTab('not_deducted')}><AlertTriangle size={14} /> Not Deducted <span className="num opacity-70">{notDeducted.length}</span></Chip>
        <div className="flex-1" />
        <Input placeholder="Search party / ledger / narration…" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
      </div>

      {tab === 'not_deducted' && (
        <div className="mb-3 text-xs text-muted bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
          Vendor payments and <b>advances</b> (incl. Loans &amp; Advances like venue advances) where no TDS ledger appears in the voucher. These sit outside the P&amp;L, so a venue advance such as <b>Aldovia</b> shows up here rather than being silently missed.
        </div>
      )}

      <DataTable columns={tab === 'deducted' ? deductedCols : missCols} rows={rows} keyFn={(r) => r.lineId} dense pageSize={200} />
    </div>
  )
}
