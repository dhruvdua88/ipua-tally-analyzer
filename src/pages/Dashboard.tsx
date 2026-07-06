import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { computeMis } from '@/lib/mis'
import { computePnl, computeBs } from '@/lib/pnlBs'
import { computeTdsReview } from '@/lib/tds'
import { computeGstAdvances } from '@/lib/gstAdvances'
import { computeExceptions } from '@/lib/exceptions'
import { exportMis } from '@/lib/excel'
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Button, Empty, Badge } from '@/components/ui'
import { StatCard, TraceAmount, Money } from '@/components/shared'
import { inrCompact, monthLabel } from '@/lib/format'
import { navigate } from '@/nav'
import type { DaybookLine, LedgerCategory } from '@/lib/types'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { Download, TrendingUp, TrendingDown, Scale, Wallet, ArrowDownRight, ArrowUpRight, Banknote, ShieldAlert } from 'lucide-react'

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted))' }

export function Dashboard() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)
  const rules = useStore((s) => s.tdsRules)

  const mis = useMemo(() => ds && computeMis(ds), [ds])
  const pnl = useMemo(() => ds && computePnl(ds), [ds])
  const bs = useMemo(() => ds && pnl && computeBs(ds, pnl.surplus), [ds, pnl])
  const exCounts = useMemo(() => {
    if (!ds) return { high: 0, medium: 0, low: 0, total: 0 }
    const tds = computeTdsReview(ds, rules)
    const adv = computeGstAdvances(ds)
    const ex = computeExceptions(ds, tds, adv)
    return { high: ex.filter((e) => e.severity === 'high').length, medium: ex.filter((e) => e.severity === 'medium').length, low: ex.filter((e) => e.severity === 'low').length, total: ex.length }
  }, [ds, rules])

  if (!ds || !mis || !pnl) return <Empty title="No data loaded" hint="Upload a Tally export to see the dashboard." />

  const linesByCat = (cats: LedgerCategory[]) => ds.lines.filter((l) => cats.includes(l.category))
  const drill = (title: string, cats: LedgerCategory[], subtitle?: string) =>
    open({ title, subtitle, lines: linesByCat(cats) })

  const monthData = mis.months.map((m) => ({ month: monthLabel(m.month).replace(' 20', " '"), income: Math.round(m.income), expense: Math.round(Math.abs(m.expense)), surplus: Math.round(m.surplus) }))
  const topExp = mis.topExpenseLedgers.slice(0, 8).map((l) => ({ name: l.name.length > 22 ? l.name.slice(0, 20) + '…' : l.name, full: l.name, value: Math.round(Math.abs(l.amount)) }))

  return (
    <div>
      <PageHeader title="MIS Dashboard" subtitle={`${ds.company} · ${ds.periodFrom?.slice(0, 7) && monthLabel(ds.periodFrom.slice(0, 7))} – ${ds.periodTo?.slice(0, 7) && monthLabel(ds.periodTo.slice(0, 7))}`}
        right={<Button variant="outline" onClick={() => bs && exportMis(mis, pnl, bs, ds.company)}><Download size={15} /> Export MIS</Button>} />

      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" tone="ok" icon={<TrendingUp size={15} />}
          value={<TraceAmount value={mis.totalIncome} compact onClick={() => drill('Income lines', ['income'])} />}
          sub={`${mis.months.length} months`} />
        <StatCard label="Total Expense" tone="info" icon={<TrendingDown size={15} />}
          value={<TraceAmount value={mis.totalExpense} compact onClick={() => drill('Expense lines', ['expense'])} />} />
        <StatCard label="Surplus / Deficit" tone={mis.surplus >= 0 ? 'gold' : 'risk'} icon={<Scale size={15} />}
          value={<TraceAmount value={mis.surplus} compact onClick={() => navigate('pnlbs')} />} />
        <StatCard label="Cash & Bank" tone="info" icon={<Banknote size={15} />}
          value={<TraceAmount value={mis.cashBank} compact onClick={() => drill('Bank & Cash movement', ['bank_cash'])} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <StatCard label="Receivables" icon={<ArrowUpRight size={15} />}
          value={<TraceAmount value={mis.receivables} compact onClick={() => drill('Debtor movement', ['party'], 'All party lines')} />} />
        <StatCard label="Payables" icon={<ArrowDownRight size={15} />}
          value={<TraceAmount value={mis.payables} compact onClick={() => drill('Creditor / party movement', ['party'])} />} />
        <StatCard label="Advances" tone="warn" icon={<Wallet size={15} />}
          value={<TraceAmount value={mis.advancesReceived + mis.advancesPaid} compact onClick={() => navigate('advances')} />}
          sub={`Recd ${inrCompact(mis.advancesReceived)} · Paid ${inrCompact(mis.advancesPaid)}`} />
        <StatCard label="Statutory Dues" tone="warn" icon={<ShieldAlert size={15} />}
          value={<TraceAmount value={mis.statutoryDues} compact onClick={() => drill('GST / TDS / statutory lines', ['gst', 'tds', 'statutory'])} />}
          sub={`GST net ${inrCompact(mis.gstNet)} · TDS ${inrCompact(mis.tdsPayable)}`} />
      </div>

      {/* Exceptions banner */}
      <Card className="mt-3 border-l-2 border-l-risk">
        <div className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <ShieldAlert size={20} className="text-risk" />
            <div>
              <div className="text-sm font-semibold text-ink">{exCounts.total} exceptions flagged</div>
              <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
                <Badge color="risk">{exCounts.high} high</Badge>
                <Badge color="warn">{exCounts.medium} medium</Badge>
                <Badge color="muted">{exCounts.low} low</Badge>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('exceptions')}>Review exceptions →</Button>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Income vs Expense — monthly</CardTitle></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v).replace('₹', '')} width={54} />
                <Tooltip cursor={{ fill: 'hsl(var(--surface2))' }} contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n) => [inrCompact(v), n]} />
                <Bar dataKey="income" name="Income" fill="hsl(var(--ok))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monthly surplus</CardTitle></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v).replace('₹', '')} width={54} />
                <Tooltip contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => inrCompact(v)} />
                <Line dataKey="surplus" name="Surplus" stroke="hsl(var(--gold))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--gold))' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Top ledgers + parties */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Card>
          <CardHeader><CardTitle>Top expense ledgers</CardTitle></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={topExp} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide tickFormatter={(v) => inrCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted))' }} width={140} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'hsl(var(--surface2))' }} contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => inrCompact(v)} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {topExp.map((_, i) => <Cell key={i} fill="hsl(var(--info))" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top parties by turnover</CardTitle></CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-border/60">
              {mis.topParties.slice(0, 8).map((p) => (
                <button key={p.name} onClick={() => open({ title: p.name, subtitle: 'All ledger lines', lines: ds.lines.filter((l) => l.ledgerName === p.name || l.partyName === p.name) })}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface2/60 text-left">
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge color={p.type === 'debtor' ? 'info' : p.type === 'creditor' ? 'gold' : 'muted'}>{p.type}</Badge>
                    <span className="text-sm text-ink truncate">{p.name}</span>
                  </span>
                  <Money value={p.amount} className="text-sm shrink-0" />
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
