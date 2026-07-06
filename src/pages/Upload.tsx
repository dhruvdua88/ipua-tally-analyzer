import { useCallback, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { parseZip } from '@/lib/parseZip'
import { normalize } from '@/lib/normalize'
import { navigate } from '@/nav'
import { PageHeader, Card, Button, Badge } from '@/components/ui'
import { StatCard } from '@/components/shared'
import { inrCompact, monthLabel } from '@/lib/format'
import { UploadCloud, FileArchive, CheckCircle2, Loader2, Database, Users, ScrollText, Layers } from 'lucide-react'

export function UploadPage() {
  const ds = useStore((s) => s.dataset)
  const ingest = useStore((s) => s.ingest)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = useCallback(async (file: File | Blob) => {
    setBusy(true); setErr(null)
    try {
      const tables = await parseZip(file)
      if (!tables.length) throw new Error('No CSV files found inside the ZIP.')
      const data = normalize(tables)
      if (!data.ledgers.length && !data.lines.length) throw new Error('Parsed the ZIP but found no ledgers or vouchers. Is this a Tally-loader export?')
      await ingest(data)
      navigate('dashboard')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [ingest])

  const loadSample = useCallback(async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample/IPUA_sample_tally_export.zip`)
      if (!res.ok) throw new Error('Sample file not available.')
      await handle(await res.blob())
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }, [handle])

  return (
    <div>
      <PageHeader title="Upload Tally Export"
        subtitle="Drop a tally-database-loader ZIP (CSV export). Everything is parsed and stored locally in your browser — no data leaves this device." />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f) }}
        className={`rounded-2xl border-2 border-dashed transition-colors ${drag ? 'border-gold bg-gold/5' : 'border-border bg-surface'} `}>
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          {busy ? <Loader2 className="animate-spin text-gold" size={38} /> : <UploadCloud className="text-faint" size={38} />}
          <div className="mt-4 text-base font-semibold text-ink">{busy ? 'Parsing export…' : 'Drop your Tally export ZIP here'}</div>
          <div className="mt-1 text-sm text-muted">or</div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
              <FileArchive size={15} /> Choose ZIP file
            </Button>
            <Button variant="outline" onClick={loadSample} disabled={busy}>Load sample data</Button>
          </div>
          <input ref={inputRef} type="file" accept=".zip" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f) }} />
          {err && <div className="mt-4 text-sm text-risk bg-risk/10 border border-risk/30 rounded-lg px-3 py-2 max-w-md">{err}</div>}
        </div>
      </div>

      {ds && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-ok" />
            <span className="text-sm text-ink font-medium">Loaded: {ds.company}</span>
            <Badge color="muted">{ds.periodFrom && monthLabel(ds.periodFrom.slice(0, 7))} – {ds.periodTo && monthLabel(ds.periodTo.slice(0, 7))}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Ledgers" value={ds.ledgers.length} icon={<Database size={15} />} onClick={() => navigate('mapping')} />
            <StatCard label="Vouchers" value={ds.vouchers.length} icon={<ScrollText size={15} />} onClick={() => navigate('preview')} />
            <StatCard label="Daybook Lines" value={ds.lines.length} icon={<Layers size={15} />} onClick={() => navigate('preview')} />
            <StatCard label="Parties" value={ds.parties.length} icon={<Users size={15} />} onClick={() => navigate('mapping')} />
          </div>
          <Card className="mt-3">
            <div className="p-4">
              <div className="text-sm font-medium text-ink mb-2">Detected tables</div>
              <div className="flex flex-wrap gap-1.5">
                {ds.raw.filter((t) => t.rows.length).sort((a, b) => b.rows.length - a.rows.length).map((t) => (
                  <Badge key={t.name} color="muted"><span className="text-ink">{t.name}</span><span className="num text-faint ml-1">{t.rows.length}</span></Badge>
                ))}
              </div>
              <div className="mt-3 text-xs text-muted">
                Positive-amount total <span className="num text-ink">{inrCompact(ds.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0))}</span> · go to the
                <button className="trace mx-1" onClick={() => navigate('dashboard')}>MIS Dashboard</button> to begin.
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
