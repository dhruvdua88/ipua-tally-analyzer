import { type ReactNode, type HTMLAttributes, type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'

// ---- Card --------------------------------------------------------------
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface', className)} {...p} />
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3 border-b border-border flex items-center justify-between gap-3', className)} {...p} />
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold tracking-tight text-ink', className)} {...p} />
}
export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...p} />
}

// ---- Button ------------------------------------------------------------
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline' | 'subtle'
  size?: 'sm' | 'md'
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = 'outline', size = 'md', ...p }, ref) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/70'
  const sizes = { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' }
  const variants = {
    primary: 'bg-gold text-bg hover:bg-gold/90 font-semibold',
    ghost: 'text-muted hover:text-ink hover:bg-surface2',
    outline: 'border border-border text-ink hover:bg-surface2',
    subtle: 'bg-surface2 text-ink hover:bg-border',
  }
  return <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...p} />
})

// ---- Badge -------------------------------------------------------------
const badgeColor: Record<string, string> = {
  ok: 'bg-ok/15 text-ok border-ok/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  risk: 'bg-risk/15 text-risk border-risk/30',
  info: 'bg-info/15 text-info border-info/30',
  gold: 'bg-gold/15 text-gold border-gold/30',
  muted: 'bg-surface2 text-muted border-border',
}
export function Badge({ color = 'muted', children, className }: { color?: string; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap', badgeColor[color] ?? badgeColor.muted, className)}>{children}</span>
}

// ---- Input -------------------------------------------------------------
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p }, ref) {
  return <input ref={ref} className={cn('h-9 rounded-lg border border-border bg-bg px-3 text-sm text-ink placeholder:text-faint focus:outline focus:outline-2 focus:outline-gold/60', className)} {...p} />
})

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select className={cn('h-9 rounded-lg border border-border bg-bg px-2 text-sm text-ink focus:outline focus:outline-2 focus:outline-gold/60', className)} {...p}>{children}</select>
}

// ---- Section title -----------------------------------------------------
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

// ---- Empty state -------------------------------------------------------
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-muted text-sm font-medium">{title}</div>
      {hint && <div className="text-faint text-xs mt-1 max-w-sm">{hint}</div>}
    </div>
  )
}
