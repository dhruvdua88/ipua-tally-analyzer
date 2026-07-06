import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { computeGstRecon } from '@/lib/gstRecon'
import { exportGstRecon } from '@/lib/excel'
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Button, Empty, Badge } from '@/components/ui'
import { StatCard, TraceAmount, Money, DataTable, type Column } from '@/components/shared'
import { inrCompact, monthLabel } from '@/lib/format'
import type { GstMonthRow, LedgerSubtype } from '@/lib/types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Download, ArrowUpRight, ArrowDownRight, RefreshCw, Scale, Banknote, AlertTriangle, ShieldAlert } from 'lucide-react'

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted))' }

export function GstReconPage() {
  const ds = useStore((s) => s.dataset)
  const open = useStore((s) => s.openDrilldown)

  const rows = useMemo(() => (ds ? computeGstRecon(ds) : []), [ds])

  if (!ds) return <Empty title="No data loaded" hint="Upload a Tally export to see the GST reconciliation." />

  const drillSubtype = (title: string, subtype: LedgerSubtype) =>
    open({ title, subtitle: 'All months', lines: ds.lines.filter((l) => l.subtype === subtype) })

  const totalOutput = rows.reduce((s, r) => s + r.outputGst, 0)
  const totalInput = rows.reduce((s, r) => s + r.inputGst, 0)
  const totalRcm = rows.reduce((s, r) => s + r.rcm, 0)
  const totalNet = rows.reduce((s, r) => s + r.netLiability, 0)
  const totalPaid = rows.reduce((s, r) => s + r.gstPaid, 0)
  const totalSalesWithoutGst = rows.reduce((s, r) => s + r.salesWithoutGst, 0)
  const totalGstWithoutSales = rows.reduce((s, r) => s + r.gstWithoutSales, 0)

  const chartData = rows.map((r) => ({
    month: monthLabel(r.month).replace(' 20', " '"),
    output: Math.round(r.outputGst), input: Math.round(r.inputGst), rcm: Math.round(r.rcm),
  }))

  const flagColor = (f: string) => (/without sales|unpaid/i.test(f) ? 'risk' : 'warn')

  const columns: Column<GstMonthRow>[] = [
    { key: 'month', header: 'Month', sortValue: (r) => r.month, render: (r) => <span className="text-ink">{monthLabel(r.month)}</span> },
    { key: 'output', header: 'Output', align: 'right', sortValue: (r) => r.outputGst, render: (r) => <Money value={r.outputGst} /> },
    { key: 'input', header: 'Input', align: 'right', sortValue: (r) => r.inputGst, render: (r) => <Money value={r.inputGst} /> },
    { key: 'rcm', header: 'RCM', align: 'right', sortValue: (r) => r.rcm, render: (r) => <Money value={r.rcm} /> },
    { key: 'net', header: 'Net Liability', align: 'right', sortValue: (r) => r.netLiability, render: (r) => <span className={r.netLiability > 0 ? 'text-risk' : ''}><Money value={r.netLiability} /></span> },
    { key: 'paid', header: 'GST Paid', align: 'right', sortValue: (r) => r.gstPaid, render: (r) => <Money value={r.gstPaid} /> },
    { key: 'salesTaxable', header: 'Sales Taxable', align: 'right', sortValue: (r) => r.salesTaxable, render: (r) => <Money value={r.salesTaxable} /> },
    { key: 'salesWithoutGst', header: 'Sales w/o GST', align: 'right', sortValue: (r) => r.salesWithoutGst, render: (r) => <Money value={r.salesWithoutGst} /> },
    { key: 'gstWithoutSales', header: 'GST w/o Sales', align: 'right', sortValue: (r) => r.gstWithoutSales, render: (r) => <Money value={r.gstWithoutSales} /> },
    {
      key: 'flags', header: 'Flags', sortValue: (r) => r.flags.length, render: (r) => r.flags.length
        ? <span className="flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} color={flagColor(f)}>{f}</Badge>)}</span>
        : <span className="text-faint">—</span>,
    },
  ]

  return (
    <div>
      <PageHeader title="GST Reconciliation" subtitle={`${ds.company} · ${rows.length} months`}
        right={<Button variant="outline" onClick={() => exportGstRecon(rows, ds.company)}><Download size={15} /> Export GST recon</Button>} />

      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Output GST" tone="info" icon={<ArrowUpRight size={15} />}
          value={<TraceAmount value={totalOutput} compact onClick={() => drillSubtype('Output GST lines', 'gst_output')} />} />
        <StatCard label="Input GST (ITC)" tone="ok" icon={<ArrowDownRight size={15} />}
          value={<TraceAmount value={totalInput} compact onClick={() => drillSubtype('Input GST (ITC) lines', 'gst_input')} />} />
        <StatCard label="RCM" tone="warn" icon={<RefreshCw size={15} />}
          value={<TraceAmount value={totalRcm} compact onClick={() => drillSubtype('RCM lines', 'gst_rcm')} />} />
        <StatCard label="Net Liability" tone={totalNet > 0 ? 'risk' : 'ok'} icon={<Scale size={15} />}
          value={<TraceAmount value={totalNet} compact />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <StatCard label="GST Paid" tone="info" icon={<Banknote size={15} />}
          value={<TraceAmount value={totalPaid} compact />} />
        <StatCard label="Sales without GST" tone={totalSalesWithoutGst > 0 ? 'warn' : undefined} icon={<AlertTriangle size={15} />}
          value={<TraceAmount value={totalSalesWithoutGst} compact />} />
        <StatCard label="GST without Sales" tone={totalGstWithoutSales > 0 ? 'risk' : undefined} icon={<ShieldAlert size={15} />}
          value={<TraceAmount value={totalGstWithoutSales} compact />} />
      </div>

      {/* Chart */}
      <Card className="mt-3">
        <CardHeader><CardTitle>Output vs Input vs RCM — monthly</CardTitle></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v).replace('₹', '')} width={54} />
              <Tooltip cursor={{ fill: 'hsl(var(--surface2))' }} contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n) => [inrCompact(v), n]} />
              <Bar dataKey="output" name="Output" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="input" name="Input" fill="hsl(var(--ok))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="rcm" name="RCM" fill="hsl(var(--warn))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Table */}
      <div className="mt-3">
        <DataTable<GstMonthRow> columns={columns} rows={rows} keyFn={(r) => r.month} />
      </div>
    </div>
  )
}
