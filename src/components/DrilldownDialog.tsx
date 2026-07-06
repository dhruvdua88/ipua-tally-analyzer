import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { dateLabel } from '@/lib/format'
import { Money, DataTable, type Column } from './shared'
import { Badge } from './ui'
import type { DaybookLine } from '@/lib/types'
import { X } from 'lucide-react'

export function DrilldownDialog() {
  const d = useStore((s) => s.drilldown)
  const close = useStore((s) => s.closeDrilldown)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    if (d) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [d, close])

  if (!d) return null
  const total = d.lines.reduce((s, l) => s + l.amount, 0)

  const cols: Column<DaybookLine>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="text-muted whitespace-nowrap">{dateLabel(r.date)}</span> },
    { key: 'voucher', header: 'Voucher', render: (r) => <span className="whitespace-nowrap"><Badge color="muted">{r.voucherType}</Badge> <span className="num text-faint">#{r.voucherNumber}</span></span> },
    { key: 'party', header: 'Party', render: (r) => <span className="text-ink">{r.partyName || '—'}</span> },
    { key: 'ledger', header: 'Ledger', render: (r) => <span className="text-ink">{r.ledgerName}</span> },
    { key: 'narration', header: 'Narration', render: (r) => <span className="text-faint text-xs">{r.narration || '—'}</span> },
    { key: 'drcr', header: 'Dr/Cr', align: 'center', render: (r) => <Badge color={r.drcr === 'Dr' ? 'info' : 'gold'}>{r.drcr}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <Money value={r.amount} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={close} />
      <div className="relative w-full sm:max-w-5xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between gap-4 px-5 py-3.5 border-b border-border">
          <div>
            <div className="text-sm font-semibold text-ink">{d.title}</div>
            {d.subtitle && <div className="text-xs text-muted mt-0.5">{d.subtitle}</div>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xs uppercase tracking-wider text-muted">Net</div>
              <Money value={total} className="text-base font-semibold" />
            </div>
            <button onClick={close} className="text-muted hover:text-ink p-1 rounded hover:bg-surface2"><X size={18} /></button>
          </div>
        </div>
        <div className="p-4 overflow-hidden">
          <div className="text-xs text-muted mb-2">{d.lines.length} accounting line{d.lines.length !== 1 ? 's' : ''}</div>
          <DataTable columns={cols} rows={d.lines} keyFn={(r) => r.id} dense maxHeight="60vh" pageSize={200} />
        </div>
      </div>
    </div>
  )
}
