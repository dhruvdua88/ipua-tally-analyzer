import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Upload, Table2, Tags, Receipt, Wallet, Landmark, BookOpen, AlertTriangle,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  group: 'Overview' | 'Data' | 'Compliance' | 'Statements'
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'MIS Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle, group: 'Overview' },
  { id: 'upload', label: 'Upload & Preview', icon: Upload, group: 'Data' },
  { id: 'mapping', label: 'Ledger Mapping', icon: Tags, group: 'Data' },
  { id: 'tds', label: 'TDS Review', icon: Receipt, group: 'Compliance' },
  { id: 'advances', label: 'GST on Advances', icon: Wallet, group: 'Compliance' },
  { id: 'gstrecon', label: 'GST Reconciliation', icon: Landmark, group: 'Compliance' },
  { id: 'pnlbs', label: 'P&L + Balance Sheet', icon: BookOpen, group: 'Statements' },
  { id: 'preview', label: 'Raw Tables', icon: Table2, group: 'Data' },
]

export const NAV_GROUPS = ['Overview', 'Compliance', 'Statements', 'Data'] as const

export function currentRoute(): string {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  return h || 'dashboard'
}
export function navigate(id: string) {
  window.location.hash = `#/${id}`
}
