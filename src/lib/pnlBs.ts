import type { Dataset, PnlNode, BsNode } from './types'

const INCOME_GROUPS = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes']
const EXPENSE_GROUPS = ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses']

export interface PnlResult {
  income: PnlNode[]
  expense: PnlNode[]
  months: string[]
  totalIncome: number
  totalExpense: number
  surplus: number
  incomeByMonth: Record<string, number>
  expenseByMonth: Record<string, number>
}

/** Build P&L from period movement (daybook lines). */
export function computePnl(ds: Dataset): PnlResult {
  const months = [...new Set(ds.lines.map((l) => l.month).filter(Boolean))].sort()
  const build = (groups: string[]): PnlNode[] =>
    groups.map((grp) => {
      const gl = ds.lines.filter((l) => l.primaryGroup === grp)
      const ledgerMap = new Map<string, { amount: number; months: Record<string, number> }>()
      const monthsAgg: Record<string, number> = {}
      let amount = 0
      for (const l of gl) {
        amount += l.natural
        monthsAgg[l.month] = (monthsAgg[l.month] ?? 0) + l.natural
        let lm = ledgerMap.get(l.ledgerName)
        if (!lm) { lm = { amount: 0, months: {} }; ledgerMap.set(l.ledgerName, lm) }
        lm.amount += l.natural
        lm.months[l.month] = (lm.months[l.month] ?? 0) + l.natural
      }
      return {
        key: grp, label: grp, primaryGroups: [grp], amount, months: monthsAgg,
        ledgers: [...ledgerMap.entries()]
          .map(([name, v]) => ({ name, amount: v.amount, months: v.months }))
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      }
    }).filter((n) => n.ledgers.length > 0)

  const income = build(INCOME_GROUPS)
  const expense = build(EXPENSE_GROUPS)
  const totalIncome = income.reduce((s, n) => s + n.amount, 0)
  const totalExpense = expense.reduce((s, n) => s + n.amount, 0)
  const incomeByMonth: Record<string, number> = {}
  const expenseByMonth: Record<string, number> = {}
  for (const m of months) {
    incomeByMonth[m] = income.reduce((s, n) => s + (n.months[m] ?? 0), 0)
    expenseByMonth[m] = expense.reduce((s, n) => s + (n.months[m] ?? 0), 0)
  }
  return { income, expense, months, totalIncome, totalExpense, surplus: totalIncome - totalExpense, incomeByMonth, expenseByMonth }
}

export interface BsResult {
  assets: BsNode[]
  liabilities: BsNode[]
  totalAssets: number
  totalLiabilities: number
  surplus: number       // carried from P&L (income - expense)
  difference: number    // assets - (liabilities + surplus); should be ~0
}

const ASSET_CATS = new Set(['asset', 'bank_cash', 'party', 'advance_paid'])
const LIAB_CATS = new Set(['liability', 'capital', 'advance_received', 'gst', 'tds', 'statutory'])

/** Build Balance Sheet from ledger closing balances grouped by primary group. */
export function computeBs(ds: Dataset, surplus: number): BsResult {
  const assetMap = new Map<string, BsNode>()
  const liabMap = new Map<string, BsNode>()

  for (const led of ds.ledgers) {
    const bal = led.closingBalance
    if (Math.abs(bal) < 0.01) continue
    // Skip P&L ledgers — they roll into surplus
    if (led.category === 'income' || led.category === 'expense') continue
    const isAsset = ASSET_CATS.has(led.category)
      ? true
      : LIAB_CATS.has(led.category) ? false : bal >= 0
    const map = isAsset ? assetMap : liabMap
    const key = led.primaryGroup || led.parent || 'Other'
    let node = map.get(key)
    if (!node) { node = { key, label: key, side: isAsset ? 'asset' : 'liability', amount: 0, ledgers: [] }; map.set(key, node) }
    node.amount += Math.abs(bal)
    node.ledgers.push({ name: led.name, amount: Math.abs(bal) })
  }

  const assets = [...assetMap.values()].sort((a, b) => b.amount - a.amount)
  const liabilities = [...liabMap.values()].sort((a, b) => b.amount - a.amount)
  for (const n of [...assets, ...liabilities]) n.ledgers.sort((a, b) => b.amount - a.amount)
  const totalAssets = assets.reduce((s, n) => s + n.amount, 0)
  const totalLiabilities = liabilities.reduce((s, n) => s + n.amount, 0)
  return {
    assets, liabilities, totalAssets, totalLiabilities, surplus,
    difference: totalAssets - (totalLiabilities + surplus),
  }
}
