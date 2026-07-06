import { create } from 'zustand'
import type { Dataset, TdsRule, LedgerCategory, LedgerSubtype, DaybookLine } from './types'
import { classifyLedger } from './classify'
import {
  db, saveDataset, loadDataset, clearDataset, saveOverride, loadOverrides,
  saveTdsRules, loadTdsRules,
} from './db'
import { DEFAULT_TDS_RULES } from './tds'

/** A drilldown request: title + the exact lines to show. */
export interface Drilldown {
  title: string
  subtitle?: string
  lines: DaybookLine[]
  columns?: ('date' | 'voucher' | 'party' | 'ledger' | 'narration' | 'drcr' | 'amount')[]
}

interface AppState {
  dataset: Dataset | null
  loading: boolean
  tdsRules: TdsRule[]
  drilldown: Drilldown | null
  theme: 'dark' | 'light'

  hydrate: () => Promise<void>
  ingest: (data: Dataset) => Promise<void>
  reset: () => Promise<void>
  setOverride: (ledgerName: string, category: LedgerCategory, subtype: LedgerSubtype) => Promise<void>
  autoReclassify: (ledgerName: string) => Promise<void>
  setTdsRules: (rules: TdsRule[]) => Promise<void>
  openDrilldown: (d: Drilldown) => void
  closeDrilldown: () => void
  toggleTheme: () => void
}

function applyLedgerCategory(ds: Dataset, name: string, category: LedgerCategory, subtype: LedgerSubtype, source: 'auto' | 'manual', reason: string): Dataset {
  const ledgers = ds.ledgers.map((l) =>
    l.name === name ? { ...l, category, subtype, source, reason } : l
  )
  const lines = ds.lines.map((ln) =>
    ln.ledgerName === name ? { ...ln, category, subtype } : ln
  )
  return { ...ds, ledgers, lines }
}

export const useStore = create<AppState>((set, get) => ({
  dataset: null,
  loading: true,
  tdsRules: DEFAULT_TDS_RULES,
  drilldown: null,
  theme: 'dark',

  hydrate: async () => {
    set({ loading: true })
    const [ds, overrides, rules] = await Promise.all([
      loadDataset(), loadOverrides(), loadTdsRules(),
    ])
    let dataset = ds
    if (dataset && overrides.length) {
      for (const o of overrides) {
        dataset = applyLedgerCategory(dataset, o.ledgerName, o.category, o.subtype, 'manual', 'Manual override')
      }
    }
    set({
      dataset,
      tdsRules: rules ?? DEFAULT_TDS_RULES,
      loading: false,
    })
  },

  ingest: async (data) => {
    const stamped = { ...data, importedAt: performance.now() + Date.parse(data.periodTo || '2020-01-01') }
    await saveDataset(stamped)
    // re-apply any existing overrides
    const overrides = await loadOverrides()
    let dataset = stamped
    for (const o of overrides) {
      if (dataset.ledgers.some((l) => l.name === o.ledgerName)) {
        dataset = applyLedgerCategory(dataset, o.ledgerName, o.category, o.subtype, 'manual', 'Manual override')
      }
    }
    await saveDataset(dataset)
    set({ dataset })
  },

  reset: async () => {
    await clearDataset()
    set({ dataset: null })
  },

  setOverride: async (ledgerName, category, subtype) => {
    const ds = get().dataset
    if (!ds) return
    const next = applyLedgerCategory(ds, ledgerName, category, subtype, 'manual', 'Manual override')
    set({ dataset: next })
    await saveDataset(next)
    await saveOverride({ ledgerName, category, subtype })
  },

  autoReclassify: async (ledgerName) => {
    const ds = get().dataset
    if (!ds) return
    const led = ds.ledgers.find((l) => l.name === ledgerName)
    if (!led) return
    const cl = classifyLedger({
      name: led.name, group: led.parent, primaryGroup: led.primaryGroup,
      isRevenue: led.isRevenue, isDeemedPositive: led.isDeemedPositive,
    })
    const next = applyLedgerCategory(ds, ledgerName, cl.category, cl.subtype, 'auto', cl.reason)
    set({ dataset: next })
    await saveDataset(next)
    await db.overrides.delete(ledgerName) // remove any manual override
  },

  setTdsRules: async (rules) => {
    set({ tdsRules: rules })
    await saveTdsRules(rules)
  },

  openDrilldown: (d) => set({ drilldown: d }),
  closeDrilldown: () => set({ drilldown: null }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.toggle('light', next === 'light')
    root.classList.toggle('dark', next === 'dark')
    set({ theme: next })
  },
}))
