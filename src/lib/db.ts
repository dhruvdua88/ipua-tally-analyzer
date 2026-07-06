import Dexie, { type Table } from 'dexie'
import type { Dataset, TdsRule, LedgerCategory, LedgerSubtype } from './types'

export interface StoredDataset {
  id: string              // 'current'
  data: Dataset
}

export interface LedgerOverride {
  ledgerName: string
  category: LedgerCategory
  subtype: LedgerSubtype
}

export interface StoredTdsRules {
  id: string              // 'rules'
  rules: TdsRule[]
}

class AnalyzerDB extends Dexie {
  datasets!: Table<StoredDataset, string>
  overrides!: Table<LedgerOverride, string>
  tdsRules!: Table<StoredTdsRules, string>

  constructor() {
    super('tally-analyzer')
    this.version(1).stores({
      datasets: 'id',
      overrides: 'ledgerName',
      tdsRules: 'id',
    })
  }
}

export const db = new AnalyzerDB()

export async function saveDataset(data: Dataset) {
  await db.datasets.put({ id: 'current', data })
}
export async function loadDataset(): Promise<Dataset | null> {
  const rec = await db.datasets.get('current')
  return rec?.data ?? null
}
export async function clearDataset() {
  await db.datasets.clear()
  await db.overrides.clear()
}

export async function saveOverride(o: LedgerOverride) {
  await db.overrides.put(o)
}
export async function loadOverrides(): Promise<LedgerOverride[]> {
  return db.overrides.toArray()
}

export async function saveTdsRules(rules: TdsRule[]) {
  await db.tdsRules.put({ id: 'rules', rules })
}
export async function loadTdsRules(): Promise<TdsRule[] | null> {
  const rec = await db.tdsRules.get('rules')
  return rec?.rules ?? null
}
