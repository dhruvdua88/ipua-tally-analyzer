import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { computePnl, computeBs } from '@/lib/pnlBs'
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Button, Empty, Badge } from '@/components/ui'
import { Money, TraceAmount } from '@/components/shared'
import { monthLabel, inrSymbol } from '@/lib/format'
import type { PnlNode, BsNode } from '@/lib/types'
import { ChevronRight, ChevronDown } from 'lucide-react'

type Tab = 'pnl' | 'bs'

export function PnlBsPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)

  const pnl = useMemo(() => (ds ? computePnl(ds) : null), [ds])
  const bs = useMemo(() => (ds && pnl ? computeBs(ds, pnl.surplus) : null), [ds, pnl])

  const [tab, setTab] = useState<Tab>('pnl')
  const [expPnl, setExpPnl] = useState<Set<string>>(new Set())
  const [expBs, setExpBs] = useState<Set<string>>(new Set())

  if (!ds || !pnl || !bs) return <Empty title="No data loaded" hint="Upload a Tally export to see the P&L and Balance Sheet." />

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key); else next.add(key)
    setter(next)
  }

  const drillLedger = (ledgerName: string, month?: string) =>
    open({
      title: ledgerName,
      subtitle: month ? monthLabel(month) : 'All months',
      lines: ds.lines.filter((l) => l.ledgerName === ledgerName && (!month || l.month === month)),
    })

  // ---- P&L section renderer ------------------------------------------------
  const PnlSection = ({ title, nodes }: { title: string; nodes: PnlNode[] }) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody className="p-0">
        <div className="divide-y divide-border/60">
          {nodes.map((n) => {
            const on = expPnl.has(n.key)
            return (
              <div key={n.key}>
                <button onClick={() => toggle(expPnl, setExpPnl, n.key)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface2/60 text-left">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {on ? <ChevronDown size={14} className="text-faint shrink-0" /> : <ChevronRight size={14} className="text-faint shrink-0" />}
                    <span className="text-sm font-medium text-ink truncate">{n.label}</span>
                    <span className="text-2xs text-faint">({n.ledgers.length})</span>
                  </span>
                  <Money value={n.amount} className="text-sm shrink-0" />
                </button>
                {on && (
                  <div className="overflow-x-auto bg-surface2/30 border-t border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-1.5 text-left text-2xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Ledger</th>
                          {pnl.months.map((m) => (
                            <th key={m} className="px-3 py-1.5 text-right text-2xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">{monthLabel(m).replace(' 20', " '")}</th>
                          ))}
                          <th className="px-3 py-1.5 text-right text-2xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {n.ledgers.map((led) => (
                          <tr key={led.name} className="border-t border-border/40">
                            <td className="px-3 py-1.5 text-ink whitespace-nowrap">{led.name}</td>
                            {pnl.months.map((m) => {
                              const v = led.months[m] ?? 0
                              return (
                                <td key={m} className="px-3 py-1.5 text-right whitespace-nowrap">
                                  {Math.abs(v) < 0.01 ? <span className="text-faint">—</span> : <TraceAmount value={v} onClick={() => drillLedger(led.name, m)} />}
                                </td>
                              )
                            })}
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                              <TraceAmount value={led.amount} onClick={() => drillLedger(led.name)} className="font-medium" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )

  // ---- BS column renderer --------------------------------------------------
  const BsColumn = ({ title, nodes, total, extra }: { title: string; nodes: BsNode[]; total: number; extra?: { label: string; amount: number } }) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody className="p-0">
        <div className="divide-y divide-border/60">
          {nodes.map((n) => {
            const on = expBs.has(n.side + ':' + n.key)
            return (
              <div key={n.side + ':' + n.key}>
                <button onClick={() => toggle(expBs, setExpBs, n.side + ':' + n.key)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface2/60 text-left">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {on ? <ChevronDown size={14} className="text-faint shrink-0" /> : <ChevronRight size={14} className="text-faint shrink-0" />}
                    <span className="text-sm font-medium text-ink truncate">{n.label}</span>
                    <span className="text-2xs text-faint">({n.ledgers.length})</span>
                  </span>
                  <Money value={n.amount} className="text-sm shrink-0" />
                </button>
                {on && (
                  <div className="bg-surface2/30 border-t border-border/60 divide-y divide-border/40">
                    {n.ledgers.map((led) => (
                      <div key={led.name} className="flex items-center justify-between px-4 py-1.5 pl-9">
                        <span className="text-sm text-ink truncate">{led.name}</span>
                        <Money value={led.amount} className="text-sm shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {extra && (
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-gold">{extra.label}</span>
              <Money value={extra.amount} className="text-sm shrink-0" />
            </div>
          )}
        </div>
      </CardBody>
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface2/40">
        <span className="text-sm font-semibold text-ink">{title === 'Assets' ? 'Total Assets' : 'Total Liabilities + Equity'}</span>
        <Money value={total} className="text-sm font-semibold" />
      </div>
    </Card>
  )

  const diffLarge = Math.abs(bs.difference) > Math.max(1, Math.abs(bs.totalAssets) * 0.01)

  return (
    <div>
      <PageHeader title="P&L / Balance Sheet" subtitle={`${ds.company} · ${pnl.months.length} months`} />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant={tab === 'pnl' ? 'primary' : 'outline'} onClick={() => setTab('pnl')}>Profit &amp; Loss</Button>
        <Button variant={tab === 'bs' ? 'primary' : 'outline'} onClick={() => setTab('bs')}>Balance Sheet</Button>
      </div>

      {tab === 'pnl' ? (
        <div className="space-y-3">
          <PnlSection title="Income" nodes={pnl.income} />
          <PnlSection title="Expense" nodes={pnl.expense} />
          <Card>
            <CardBody className="p-0">
              <div className="divide-y divide-border/60">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium text-ink">Total Income</span>
                  <Money value={pnl.totalIncome} className="text-sm" />
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium text-ink">Total Expense</span>
                  <Money value={pnl.totalExpense} className="text-sm" />
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-surface2/40">
                  <span className={`text-sm font-semibold ${pnl.surplus >= 0 ? 'text-gold' : 'text-risk'}`}>{pnl.surplus >= 0 ? 'Surplus' : 'Deficit'} for period</span>
                  <span className={`num tabular-nums text-sm font-semibold ${pnl.surplus >= 0 ? 'text-gold' : 'text-risk'}`}>{inrSymbol(pnl.surplus)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <BsColumn title="Assets" nodes={bs.assets} total={bs.totalAssets} />
            <BsColumn title="Liabilities + Equity" nodes={bs.liabilities} total={bs.totalLiabilities + bs.surplus}
              extra={{ label: `${bs.surplus >= 0 ? 'Surplus' : 'Deficit'} carried to reserves`, amount: bs.surplus }} />
          </div>
          <Card>
            <CardBody className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink">Difference</span>
                {diffLarge && <Badge color="warn">Does not tie</Badge>}
                <span className="text-xs text-muted">should be ≈ 0; surplus of period carried to reserves</span>
              </div>
              <div className="flex items-center gap-5">
                <span className="text-2xs text-faint">Surplus <Money value={bs.surplus} className="text-sm ml-1" /></span>
                <Money value={bs.difference} className="text-sm font-semibold" />
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
