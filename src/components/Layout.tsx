import { type ReactNode } from 'react'
import { NAV, NAV_GROUPS, navigate } from '@/nav'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/cn'
import { monthLabel } from '@/lib/format'
import { Moon, Sun, Trash2 } from 'lucide-react'

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const ds = useStore((s) => s.dataset)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const reset = useStore((s) => s.reset)

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col h-full">
        <div className="px-4 h-14 flex items-center gap-2.5 border-b border-border">
          <div className="h-7 w-7 rounded-lg bg-gold/15 border border-gold/30 grid place-items-center text-gold font-bold num">₹</div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink tracking-tight">IPUA Tally Analyzer</div>
            <div className="text-2xs text-faint">Events Forum · audit workbench</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
          {NAV_GROUPS.map((grp) => (
            <div key={grp}>
              <div className="px-2 mb-1 text-2xs uppercase tracking-wider text-faint font-semibold">{grp}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === grp).map((n) => {
                  const active = route === n.id
                  const Icon = n.icon
                  return (
                    <button key={n.id} onClick={() => navigate(n.id)}
                      className={cn('w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                        active ? 'bg-gold/12 text-gold font-medium' : 'text-muted hover:text-ink hover:bg-surface2')}>
                      <Icon size={15} className={active ? 'text-gold' : 'text-faint'} />
                      {n.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          {ds && (
            <div className="px-1">
              <div className="text-2xs text-faint uppercase tracking-wider">Company</div>
              <div className="text-xs text-ink font-medium truncate">{ds.company}</div>
              <div className="text-2xs text-faint num mt-0.5">
                {ds.periodFrom && ds.periodTo ? `${monthLabel(ds.periodFrom.slice(0, 7))} – ${monthLabel(ds.periodTo.slice(0, 7))}` : ''}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button onClick={toggleTheme} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs text-muted hover:text-ink hover:bg-surface2">
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}{theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {ds && (
              <button onClick={() => { if (confirm('Clear all imported data from this browser?')) reset() }}
                className="h-8 w-8 grid place-items-center rounded-lg border border-border text-muted hover:text-risk hover:border-risk/40" title="Clear data">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
