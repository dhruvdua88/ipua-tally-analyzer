import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computeStatements, type StmtLine, type StmtNote } from '@/lib/statements'
import { exportStatements } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { PageHeader, Card, Button, Badge, Empty } from '@/components/ui'
import { Money } from '@/components/shared'
import { dateLabel } from '@/lib/format'
import { Download, Scale, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

type Tab = 'bs' | 'pnl' | 'notes'

export function PnlBsPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)
  const [tab, setTab] = useState<Tab>('bs')

  const s = useMemo(() => (ds ? computeStatements(ds) : null), [ds])
  if (!ds || !s) return <Empty title="No data loaded" hint="Upload a Tally export first." />

  const drillLedger = (name: string) => {
    const lines = ds.lines.filter((l) => l.ledgerName === name)
    if (lines.length) open({ title: name, subtitle: 'Ledger movement', lines })
  }

  const StmtRow = ({ l }: { l: StmtLine }) => {
    const header = Number.isNaN(l.amount)
    if (header) return (
      <div className="flex items-center px-4 pt-4 pb-1.5">
        <span className="text-2xs uppercase tracking-wider text-faint font-semibold">{l.label}</span>
      </div>
    )
    const isTotal = l.bold
    return (
      <div className={cn('flex items-center justify-between px-4 py-2 border-t border-border/50',
        isTotal && 'bg-surface2/50 font-semibold', l.muted && 'opacity-70')}>
        <span className={cn('text-sm flex items-center gap-2', isTotal ? 'text-ink' : 'text-muted')}>
          {l.label}
          {l.note && <button onClick={() => setTab('notes')} className="text-2xs text-gold trace">Note {l.note}</button>}
        </span>
        <Money value={l.amount} className={cn('text-sm', isTotal && 'text-ink')} />
      </div>
    )
  }

  const NoteCard = ({ n }: { n: StmtNote }) => (
    <Card>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-ink">Note {n.no} — {n.title}</span>
        <Money value={n.total} className="text-sm font-semibold" />
      </div>
      <div className="divide-y divide-border/40">
        {n.rows.map((r, i) => (
          <div key={i} className={cn('flex items-center justify-between px-4 py-1.5', r.group && 'bg-surface2/40')}>
            <button onClick={() => !r.group && drillLedger(r.name)}
              className={cn('text-sm text-left', r.sub && 'pl-4', r.group ? 'text-ink font-medium' : 'text-muted hover:text-gold')}>
              {r.name}
            </button>
            <Money value={r.amount} className="text-sm" />
          </div>
        ))}
        {!n.rows.length && <div className="px-4 py-3 text-xs text-faint">No ledgers</div>}
      </div>
    </Card>
  )

  const sevIcon = { error: <XCircle size={14} className="text-risk" />, warning: <AlertTriangle size={14} className="text-warn" />, info: <CheckCircle2 size={14} className="text-ok" /> }
  const plugTone = s.bs.plugPct < 0.01 ? 'ok' : s.bs.plugPct < 1 ? 'warn' : 'risk'

  return (
    <div>
      <PageHeader title="Financial Statements" subtitle={`Draft Schedule III · ${s.company} · ${dateLabel(s.periodFrom)} – ${dateLabel(s.periodTo)}`}
        right={<Button variant="outline" onClick={() => exportStatements(s)}><Download size={15} /> Export statements</Button>} />

      {/* reconciliation banner */}
      <Card className={cn('mb-4 border-l-2', plugTone === 'ok' ? 'border-l-ok' : plugTone === 'warn' ? 'border-l-warn' : 'border-l-risk')}>
        <div className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Scale size={18} className={plugTone === 'ok' ? 'text-ok' : plugTone === 'warn' ? 'text-warn' : 'text-risk'} />
            <div>
              <div className="text-sm font-semibold text-ink">
                Balance Sheet {s.bs.plugPct < 0.01 ? 'ties' : 'reconciles'} — Assets <span className="num">₹{Math.round(s.bs.totalAssets).toLocaleString('en-IN')}</span> = Equity &amp; Liabilities
              </div>
              <div className="text-xs text-muted mt-0.5">Reconciliation plug ₹{Math.round(s.bs.plug).toLocaleString('en-IN')} ({s.bs.plugPct.toFixed(2)}% of assets) · Surplus after tax ₹{Math.round(s.pnlSummary.pat).toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {(['bs', 'pnl', 'notes'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('h-9 px-3.5 rounded-lg text-sm font-medium border transition-colors',
                  tab === t ? 'bg-gold/15 text-gold border-gold/40' : 'border-border text-muted hover:text-ink hover:bg-surface2')}>
                {t === 'bs' ? 'Balance Sheet' : t === 'pnl' ? 'Statement of P&L' : 'Notes'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {tab === 'bs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-ink">Equity &amp; Liabilities</div>
            {s.bs.equityLiab.map((l) => <StmtRow key={l.key} l={l} />)}
          </Card>
          <Card>
            <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-ink">Assets</div>
            {s.bs.assets.map((l) => <StmtRow key={l.key} l={l} />)}
          </Card>
        </div>
      )}

      {tab === 'pnl' && (
        <Card className="max-w-3xl">
          <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-ink">Statement of Income &amp; Expenditure (P&amp;L)</div>
          {s.pnl.map((l) => <StmtRow key={l.key} l={l} />)}
        </Card>
      )}

      {tab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {s.notes.map((n) => <NoteCard key={n.no} n={n} />)}
        </div>
      )}

      {/* validation */}
      {s.validations.length > 0 && (
        <Card className="mt-4">
          <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-ink flex items-center gap-2">Validation checks <Badge color="muted">{s.validations.length}</Badge></div>
          <div className="divide-y divide-border/40">
            {s.validations.map((v, i) => (
              <div key={i} className="flex items-start gap-2.5 px-4 py-2">
                {sevIcon[v.severity]}
                <div className="text-xs"><span className="text-faint uppercase tracking-wide mr-2">{v.category}</span><span className="text-muted">{v.message}</span></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
